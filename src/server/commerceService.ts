import { createHash } from 'node:crypto';
import { Campaign, Product, Requirement } from '../types';
import { Order } from '../types';

export interface CheckoutLineInput {
  productId: string;
  requirementId: string;
  campaignId: string;
  quantity: number;
}

export interface CheckoutCatalog {
  products: Map<string, Product>;
  requirements: Map<string, Requirement>;
  campaigns: Map<string, Campaign>;
  approvedSupplierIds: Set<string>;
}

export interface PricedCheckoutLine extends CheckoutLineInput {
  product: Product;
  requirement: Requirement;
  campaign: Campaign;
  supplierId: string;
  unitPrice: number;
  subtotal: number;
}

export class CheckoutValidationError extends Error {}
export class CommerceAuthorizationError extends Error {}
export class OrderStateError extends Error {}

export function checkoutRequestKey(donorId: string, requestId: string): string {
  if (!donorId || !requestId || requestId.length < 16 || requestId.length > 128) {
    throw new CheckoutValidationError('A valid donor-scoped checkout requestId is required.');
  }
  return createHash('sha256').update(`${donorId}:${requestId}`).digest('hex');
}

export function assertOrderActorOwnership(
  order: Order,
  actorId: string,
  actorRole: 'supplier' | 'ngo',
  campaignNgoId?: string
): void {
  if (actorRole === 'supplier' && order.supplierId !== actorId) {
    throw new CommerceAuthorizationError('Suppliers may only update their own orders.');
  }
  if (actorRole === 'ngo' && (!campaignNgoId || campaignNgoId !== actorId || order.ngoId !== actorId)) {
    throw new CommerceAuthorizationError('NGOs may only confirm deliveries for their own campaigns.');
  }
}

export function assertOrderTransitionAllowed(
  currentStatus: Order['status'],
  allowedFrom: Order['status'][]
): void {
  if (!allowedFrom.includes(currentStatus)) {
    throw new OrderStateError(`Order cannot transition from '${currentStatus}'.`);
  }
}

export function normalizeCheckoutLines(value: unknown): CheckoutLineInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new CheckoutValidationError('Cart must contain between 1 and 50 distinct items.');
  }

  const lines: CheckoutLineInput[] = [];
  const keys = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') throw new CheckoutValidationError('Invalid cart item.');
    const item = raw as Record<string, unknown>;
    if (
      typeof item.productId !== 'string' || !item.productId ||
      typeof item.requirementId !== 'string' || !item.requirementId ||
      typeof item.campaignId !== 'string' || !item.campaignId ||
      !Number.isSafeInteger(item.quantity) || Number(item.quantity) <= 0
    ) throw new CheckoutValidationError('Cart items require valid IDs and a positive integer quantity.');

    const key = `${item.productId}:${item.requirementId}:${item.campaignId}`;
    if (keys.has(key)) throw new CheckoutValidationError('Duplicate cart lines are not accepted.');
    keys.add(key);
    lines.push({
      productId: item.productId,
      requirementId: item.requirementId,
      campaignId: item.campaignId,
      quantity: Number(item.quantity)
    });
  }
  return lines;
}

export function buildPricedCheckout(lines: CheckoutLineInput[], catalog: CheckoutCatalog): {
  lines: PricedCheckoutLine[];
  totalAmount: number;
  stockByProduct: Map<string, number>;
  reservedByRequirement: Map<string, number>;
} {
  const stockByProduct = new Map<string, number>();
  const reservedByRequirement = new Map<string, number>();
  const pricedLines = lines.map(line => {
    const product = catalog.products.get(line.productId);
    const requirement = catalog.requirements.get(line.requirementId);
    const campaign = catalog.campaigns.get(line.campaignId);
    if (!product || !requirement || !campaign) {
      throw new CheckoutValidationError('A cart product, requirement, or campaign no longer exists. Refresh the catalog.');
    }
    if (!catalog.approvedSupplierIds.has(product.supplierId)) {
      throw new CheckoutValidationError('A cart item belongs to a supplier that is not approved.');
    }
    if (product.complianceApproved === false || product.status === 'rejected' || product.status === 'pending_review') {
      throw new CheckoutValidationError('A cart item is not approved for procurement.');
    }
    if (campaign.status !== 'approved' && campaign.status !== 'active') {
      throw new CheckoutValidationError('Cart items must belong to an active public campaign.');
    }
    if (requirement.campaignId !== campaign.id || requirement.status === 'rejected') {
      throw new CheckoutValidationError('A requirement does not belong to the selected campaign.');
    }

    const unitPrice = Number(product.unitPrice);
    const stockAvailable = Number(product.stockAvailable ?? product.stock ?? 0);
    if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0) {
      throw new CheckoutValidationError('The catalog contains an invalid server price.');
    }
    if (!Number.isSafeInteger(stockAvailable) || stockAvailable < 0) {
      throw new CheckoutValidationError('The catalog contains invalid stock information.');
    }

    stockByProduct.set(line.productId, (stockByProduct.get(line.productId) || 0) + line.quantity);
    reservedByRequirement.set(line.requirementId, (reservedByRequirement.get(line.requirementId) || 0) + line.quantity);
    return {
      ...line,
      product,
      requirement,
      campaign,
      supplierId: product.supplierId,
      unitPrice,
      subtotal: unitPrice * line.quantity
    };
  });

  for (const [productId, requested] of stockByProduct) {
    const product = catalog.products.get(productId)!;
    const stock = Number(product.stockAvailable ?? product.stock ?? 0);
    if (requested > stock) throw new CheckoutValidationError(`Insufficient stock for '${product.name}'.`);
  }
  for (const [requirementId, requested] of reservedByRequirement) {
    const requirement = catalog.requirements.get(requirementId)!;
    const remaining = requirement.quantityNeeded - requirement.quantityFunded - (requirement.quantityReserved || 0);
    if (requested > remaining) throw new CheckoutValidationError(`Requested quantity exceeds the remaining need for '${requirement.itemName}'.`);
  }

  const totalAmount = pricedLines.reduce((sum, line) => sum + line.subtotal, 0);
  if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
    throw new CheckoutValidationError('The computed checkout total is invalid.');
  }
  return { lines: pricedLines, totalAmount, stockByProduct, reservedByRequirement };
}
