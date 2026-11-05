import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Campaign, Order, Product, Requirement } from '../src/types';
import {
  assertOrderActorOwnership,
  assertOrderTransitionAllowed,
  buildPricedCheckout,
  CheckoutValidationError,
  checkoutRequestKey,
  CommerceAuthorizationError,
  OrderStateError,
  normalizeCheckoutLines
} from '../src/server/commerceService';

const campaign: Campaign = {
  id: 'campaign-1',
  disasterName: 'Flood Relief',
  disasterType: 'Flood',
  province: 'Sindh',
  location: 'Badin',
  description: 'Emergency supplies',
  photoUrl: '',
  targetBeneficiaries: 100,
  ngoId: 'ngo-1',
  ngoName: 'Approved NGO',
  status: 'approved',
  reviewedByAdminId: 'admin-1',
  reviewedAt: 1,
  createdAt: 1
};

const product: Product = {
  id: 'product-1',
  supplierId: 'supplier-1',
  supplierName: 'Approved Supplier',
  name: 'Ration Pack',
  category: 'Food Rations',
  unitPrice: 6500,
  unit: 'Pack',
  specifications: 'Standard pack',
  stockAvailable: 10,
  complianceApproved: true,
  status: 'approved',
  createdAt: 1
};

const requirement: Requirement = {
  id: 'requirement-1',
  campaignId: campaign.id,
  itemName: 'Ration Pack',
  category: 'Food Rations',
  quantityNeeded: 20,
  quantityFunded: 2,
  quantityReserved: 3,
  quantityDelivered: 0,
  urgency: 'High',
  deadline: Date.now() + 86400000,
  unit: 'Pack'
};

const catalog = {
  products: new Map([[product.id, product]]),
  requirements: new Map([[requirement.id, requirement]]),
  campaigns: new Map([[campaign.id, campaign]]),
  approvedSupplierIds: new Set([product.supplierId])
};

const cartLine = { productId: product.id, requirementId: requirement.id, campaignId: campaign.id, quantity: 2 };

const order: Order = {
  id: 'order-1',
  orderNumber: 'order-1',
  items: [],
  donorId: 'donor-1',
  donorName: 'Donor',
  supplierId: 'supplier-1',
  supplierName: 'Supplier',
  ngoId: 'ngo-1',
  ngoName: 'NGO',
  campaignId: 'campaign-1',
  campaignName: 'Campaign',
  amount: 0,
  status: 'Dispatched',
  gatewayReference: 'DEMO-ref',
  createdAt: 1
};

test('client prices and supplier labels are discarded; price and total come from the server catalog', () => {
  const normalized = normalizeCheckoutLines([{
    ...cartLine,
    unitPrice: 1,
    price: 1,
    supplierId: 'attacker-supplier',
    productName: 'Fake product'
  }]);
  assert.deepEqual(normalized, [cartLine]);
  const plan = buildPricedCheckout(normalized, catalog);
  assert.equal(plan.lines[0].unitPrice, 6500);
  assert.equal(plan.lines[0].supplierId, 'supplier-1');
  assert.equal(plan.totalAmount, 13000);
});

test('checkout rejects invalid quantities, duplicate lines, and insufficient stock', () => {
  assert.throws(() => normalizeCheckoutLines([{ ...cartLine, quantity: 0 }]), CheckoutValidationError);
  assert.throws(() => normalizeCheckoutLines([cartLine, cartLine]), /Duplicate cart lines/);
  assert.throws(() => buildPricedCheckout([{ ...cartLine, quantity: 11 }], catalog), /Insufficient stock/);
});

test('checkout rejects exceeding unreserved campaign requirement quantity', () => {
  const highStockCatalog = {
    ...catalog,
    products: new Map([[product.id, { ...product, stockAvailable: 20 }]])
  };
  assert.throws(() => buildPricedCheckout([{ ...cartLine, quantity: 16 }], highStockCatalog), /remaining need/);
});

test('checkout aggregates stock across lines sharing one product', () => {
  const secondRequirement: Requirement = { ...requirement, id: 'requirement-2', itemName: 'Emergency Rations' };
  const multiLineCatalog = {
    ...catalog,
    products: new Map([[product.id, { ...product, stockAvailable: 10 }]]),
    requirements: new Map([
      [requirement.id, requirement],
      [secondRequirement.id, secondRequirement]
    ])
  };
  const lines = normalizeCheckoutLines([
    { ...cartLine, quantity: 6 },
    { ...cartLine, requirementId: secondRequirement.id, quantity: 6 }
  ]);
  assert.throws(() => buildPricedCheckout(lines, multiLineCatalog), /Insufficient stock/);
});

test('unapproved suppliers and inactive campaigns cannot be purchased from', () => {
  assert.throws(() => buildPricedCheckout([cartLine], { ...catalog, approvedSupplierIds: new Set() }), /supplier that is not approved/);
  const inactiveCatalog = {
    ...catalog,
    campaigns: new Map([[campaign.id, { ...campaign, status: 'rejected' as const }]])
  };
  assert.throws(() => buildPricedCheckout([cartLine], inactiveCatalog), /active public campaign/);
});

test('supplier and NGO order changes require ownership', () => {
  assert.throws(() => assertOrderActorOwnership(order, 'other-supplier', 'supplier'), CommerceAuthorizationError);
  assert.throws(() => assertOrderActorOwnership(order, 'other-ngo', 'ngo', 'other-ngo'), CommerceAuthorizationError);
  assert.doesNotThrow(() => assertOrderActorOwnership(order, 'supplier-1', 'supplier'));
  assert.doesNotThrow(() => assertOrderActorOwnership(order, 'ngo-1', 'ngo', 'ngo-1'));
});

test('legacy Paid orders cannot be dispatched without a current verified payment state', () => {
  assert.throws(() => assertOrderTransitionAllowed('Paid', ['Payment Confirmed']), OrderStateError);
  assert.doesNotThrow(() => assertOrderTransitionAllowed('Payment Confirmed', ['Payment Confirmed']));
});

test('checkout idempotency key is stable per donor request and isolated between donors', async () => {
  const entries = new Map<string, { orderId: string; paymentId: string }>();
  let createCount = 0;
  const demoCheckout = async (donorId: string, requestId: string) => {
    const key = checkoutRequestKey(donorId, requestId);
    const existing = entries.get(key);
    if (existing) return existing;
    createCount++;
    const created = { orderId: `order-${createCount}`, paymentId: `payment-${createCount}` };
    entries.set(key, created);
    return created;
  };

  const first = await demoCheckout('donor-1', 'request-123456789012');
  const replay = await demoCheckout('donor-1', 'request-123456789012');
  const otherDonor = await demoCheckout('donor-2', 'request-123456789012');
  assert.deepEqual(replay, first);
  assert.notDeepEqual(otherDonor, first);
  assert.equal(createCount, 2);
});
