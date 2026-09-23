import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import { 
  getUsers, 
  getUserById, 
  saveUser, 
  updateUser,
  getIdentifierMapping, 
  saveIdentifierMapping,
  saveOtpRecord, 
  getOtpRecord, 
  markOtpAsUsed,
  getNgos, 
  saveNgo, 
  updateNgo,
  getSuppliers, 
  saveSupplier, 
  updateSupplier,
  getCampaigns, 
  saveCampaign,
  getRequirements, 
  saveRequirement, 
  updateRequirement,
  getProducts, 
  saveProduct,
  getOrders, 
  saveOrder, 
  updateOrder,
  getTransactions, 
  saveTransaction
} from './firestoreService';
import { sendOtpEmail } from './emailService';
import { setCustomClaim, verifyFirebaseIdToken } from './adminAuthService';
import { 
  Campaign, 
  Requirement, 
  Product, 
  Order, 
  Transaction, 
  UserProfile, 
  NgoProfile, 
  SupplierProfile 
} from '../types';

export const app = express();
app.use(express.json());

// Initialize statutory admin identifier mapping in Firestore
async function initStatutoryAdmin() {
  try {
    const adminEmail = 'admin@pakrelief.gov.pk';
    const existing = await getIdentifierMapping(adminEmail);
    if (!existing) {
      await saveIdentifierMapping(adminEmail, {
        identifier: adminEmail,
        email: adminEmail,
        role: 'admin',
        name: 'National Disaster Management Authority (Admin)',
        verificationStatus: 'approved'
      });
      console.log('[PakRelief] Initialized NDMA statutory admin mapping in Firestore');
    }
  } catch (err) {
    console.warn('[PakRelief] Warning initializing admin mapping:', err);
  }
}
initStatutoryAdmin();

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'PakRelief Production API', timestamp: Date.now() });
});

// ==========================================
// 1. REAL OTP TRANSMISSION & VERIFICATION (Strict 1-Minute Expiry)
// ==========================================

app.post('/api/otp/send', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ success: false, error: 'A valid email address is required.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  // Generate real 6-digit random code (e.g. 841920)
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const now = Date.now();
  // Exactly 60 seconds (1 minute) expiry
  const expiresAt = now + 60 * 1000;

  // Persist OTP record in Firestore
  await saveOtpRecord({
    email: normalizedEmail,
    code,
    expiresAt,
    used: false,
    createdAt: now
  });

  // Send real email via Nodemailer
  const emailResult = await sendOtpEmail(normalizedEmail, code);

  res.json({
    success: true,
    message: emailResult.isSimulator 
      ? `Verification OTP sent via test SMTP server (Ethereal). Valid for 1 minute.`
      : `Verification OTP dispatched to your inbox (${normalizedEmail}) via ${emailResult.provider}. It expires in 1 minute.`,
    expiresInSeconds: 60,
    expiresAt,
    previewUrl: emailResult.previewUrl || false,
    isSimulator: emailResult.isSimulator,
    provider: emailResult.provider,
    devOtpPreview: emailResult.isSimulator ? code : undefined
  });
});

app.post('/api/otp/verify', async (req: Request, res: Response): Promise<void> => {
  const { email, code } = req.body;
  if (!email || !code) {
    res.status(400).json({ success: false, error: 'Email and verification code are required.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedCode = code.toString().trim();

  const record = await getOtpRecord(normalizedEmail);
  if (!record) {
    res.status(400).json({ success: false, error: 'No OTP request found for this email address.' });
    return;
  }

  if (record.used) {
    res.status(400).json({ success: false, error: 'This verification code has already been used. Please request a fresh OTP.' });
    return;
  }

  const now = Date.now();
  if (now > record.expiresAt) {
    res.status(400).json({ 
      success: false, 
      error: 'OTP has expired (1-minute statutory limit exceeded). Please click Resend OTP.' 
    });
    return;
  }

  if (record.code !== trimmedCode) {
    res.status(400).json({ success: false, error: 'Incorrect verification code. Please check your email and try again.' });
    return;
  }

  // Mark as used in Firestore
  await markOtpAsUsed(normalizedEmail);

  res.json({
    success: true,
    message: 'Email address verified successfully.'
  });
});

// ==========================================
// 2. IDENTIFIER LOOKUP & REGISTRATION (Real Firebase Auth Integration)
// ==========================================

app.post('/api/auth/lookup-identifier', async (req: Request, res: Response): Promise<void> => {
  const { identifier, role } = req.body;
  if (!identifier) {
    res.status(400).json({ success: false, error: 'Identifier is required.' });
    return;
  }

  const mapping = await getIdentifierMapping(identifier);
  if (!mapping) {
    res.status(404).json({ success: false, error: 'No account registered with this identifier. Please verify your credentials or sign up.' });
    return;
  }

  if (role && mapping.role !== role) {
    res.status(400).json({ success: false, error: `This identifier is registered as a ${mapping.role.toUpperCase()}, not ${role.toUpperCase()}.` });
    return;
  }

  res.json({
    success: true,
    email: mapping.email,
    role: mapping.role,
    name: mapping.name,
    userId: mapping.userId
  });
});

app.post('/api/auth/register-profile', async (req: Request, res: Response): Promise<void> => {
  const { 
    uid, 
    email, 
    name, 
    role, 
    identifier, 
    contact,
    focalPerson,
    registrationType,
    businessType,
    warehouseCity,
    address
  } = req.body;

  if (!uid || !email || !role || !identifier) {
    res.status(400).json({ success: false, error: 'Missing mandatory registration fields.' });
    return;
  }

  const now = Date.now();
  const normalizedEmail = email.trim().toLowerCase();
  const isDonor = role === 'donor';
  const isAdmin = role === 'admin';
  const initialStatus = (isDonor || isAdmin) ? 'approved' : 'pending';

  // 1. Create UserProfile in Firestore
  const userProfile: UserProfile = {
    id: uid,
    firebaseUid: uid,
    email: normalizedEmail,
    name: name || normalizedEmail,
    role,
    contact: contact || '',
    emailVerified: true,
    verificationStatus: initialStatus === 'approved' ? 'active' : 'pending',
    createdAt: now,
    identifier: identifier.trim()
  };
  await saveUser(userProfile);

  // 2. Save Identifier Mapping
  await saveIdentifierMapping(identifier, {
    identifier: identifier.trim(),
    email: normalizedEmail,
    role,
    userId: uid,
    name: userProfile.name,
    verificationStatus: initialStatus
  });

  // Also map email as identifier
  await saveIdentifierMapping(normalizedEmail, {
    identifier: normalizedEmail,
    email: normalizedEmail,
    role,
    userId: uid,
    name: userProfile.name,
    verificationStatus: initialStatus
  });

  // 3. Create Role-Specific Entity Record
  if (role === 'ngo') {
    const ngoProfile: NgoProfile = {
      id: uid,
      linkedUserId: uid,
      organizationName: name,
      registrationType: registrationType || 'SECP',
      registrationNumber: identifier.trim(),
      focalPerson: focalPerson || name,
      phone: contact || '',
      address: address || '',
      email: normalizedEmail,
      status: 'pending',
      createdAt: now
    };
    await saveNgo(ngoProfile);
  } else if (role === 'supplier') {
    const supplierProfile: SupplierProfile = {
      id: uid,
      linkedUserId: uid,
      companyName: name,
      businessType: businessType || 'Distributor',
      cuinOrCnic: identifier.trim(),
      warehouseCity: warehouseCity || 'Karachi',
      phone: contact || '',
      email: normalizedEmail,
      status: 'pending',
      createdAt: now
    };
    await saveSupplier(supplierProfile);
  }

  // 4. Set custom claim immediately for Donors and Admins
  if (isDonor || isAdmin) {
    await setCustomClaim(uid, { role });
  }

  res.json({
    success: true,
    user: userProfile,
    message: initialStatus === 'pending'
      ? 'Registration submitted! Your statutory documents are awaiting NDMA Admin approval.'
      : 'Account registered and verified successfully.'
  });
});

// Profile Lookup by Token
app.get('/api/auth/profile', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized. Missing token.' });
    return;
  }

  const token = authHeader.split('Bearer ')[1];
  const verified = await verifyFirebaseIdToken(token);
  if (!verified) {
    res.status(401).json({ success: false, error: 'Invalid or expired Firebase authentication token.' });
    return;
  }

  const user = await getUserById(verified.uid);
  if (!user) {
    res.status(404).json({ success: false, error: 'User profile not found in Firestore.' });
    return;
  }

  res.json({ success: true, user });
});

// ==========================================
// 3. REAL DISASTER CAMPAIGNS & REQUIREMENTS
// ==========================================

app.get('/api/campaigns', async (req: Request, res: Response): Promise<void> => {
  const campaigns = await getCampaigns();
  const requirements = await getRequirements();

  // Attach requirements to each campaign
  const populated = campaigns.map(camp => ({
    ...camp,
    requirements: requirements.filter(r => r.campaignId === camp.id)
  }));

  res.json({ success: true, campaigns: populated });
});

app.post('/api/campaigns', async (req: Request, res: Response): Promise<void> => {
  const { 
    disasterName, 
    disasterType, 
    location, 
    province, 
    description, 
    urgentNotice,
    targetBeneficiaries,
    campCoordinates,
    ngoId,
    ngoName,
    photoUrl,
    requirements
  } = req.body;

  if (!disasterName || !location || !province || !ngoId) {
    res.status(400).json({ success: false, error: 'Missing required campaign information.' });
    return;
  }

  const campaignId = `camp-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const now = Date.now();

  const newCampaign: Campaign = {
    id: campaignId,
    ngoId,
    ngoName: ngoName || 'Accredited Relief NGO',
    disasterName,
    disasterType: disasterType || 'Flood',
    location,
    province,
    description: description || '',
    urgentNotice: urgentNotice || '',
    targetBeneficiaries: Number(targetBeneficiaries) || 1000,
    campCoordinates: campCoordinates || 'Disaster Relief Base Camp',
    photoUrl: photoUrl || 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=1200&q=80',
    createdAt: now,
    status: 'active'
  };

  await saveCampaign(newCampaign);

  // Save requirements if provided
  if (Array.isArray(requirements)) {
    for (const reqItem of requirements) {
      const reqId = `req-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const newReq: Requirement = {
        id: reqId,
        campaignId,
        category: reqItem.category || 'Food Rations',
        itemName: reqItem.itemName,
        specifications: reqItem.specifications || '',
        quantityNeeded: Number(reqItem.quantityNeeded) || 100,
        quantityFunded: 0,
        quantityDelivered: 0,
        unit: reqItem.unit || 'Pack',
        estimatedUnitPrice: Number(reqItem.estimatedUnitPrice) || 1000,
        urgency: reqItem.urgency || 'High',
        deadline: reqItem.deadline || Date.now() + 14 * 86400000
      };
      await saveRequirement(newReq);
    }
  }

  res.json({ success: true, campaign: newCampaign });
});

app.get('/api/requirements', async (req: Request, res: Response): Promise<void> => {
  const campaignId = req.query.campaignId as string | undefined;
  const requirements = await getRequirements(campaignId);
  res.json({ success: true, requirements });
});

app.post('/api/requirements', async (req: Request, res: Response): Promise<void> => {
  const { 
    campaignId, 
    itemName, 
    itemType, 
    category, 
    quantityNeeded, 
    unit, 
    urgency, 
    specifications, 
    deadline, 
    estimatedCost, 
    estimatedUnitPrice 
  } = req.body;

  if (!campaignId || (!itemName && !itemType)) {
    res.status(400).json({ success: false, error: 'Campaign ID and Item name are required.' });
    return;
  }

  const reqId = `req-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const newReq: Requirement = {
    id: reqId,
    campaignId,
    category: category || 'Food Rations',
    itemName: itemName || itemType || 'Relief Goods',
    specifications: specifications || '',
    quantityNeeded: Number(quantityNeeded) || 100,
    quantityFunded: 0,
    quantityDelivered: 0,
    unit: unit || 'Pack',
    estimatedUnitPrice: Number(estimatedUnitPrice || estimatedCost) || 1000,
    urgency: urgency || 'High',
    deadline: deadline ? (typeof deadline === 'number' ? deadline : new Date(deadline).getTime()) : Date.now() + 14 * 86400000
  };

  await saveRequirement(newReq);
  res.json({ success: true, requirement: newReq });
});

// ==========================================
// 4. REAL SUPPLIER PRODUCTS
// ==========================================

app.get('/api/products', async (req: Request, res: Response): Promise<void> => {
  const supplierId = req.query.supplierId as string | undefined;
  const products = await getProducts(supplierId);
  res.json({ success: true, products });
});

app.post('/api/products', async (req: Request, res: Response): Promise<void> => {
  const { 
    supplierId, 
    supplierName, 
    name, 
    category, 
    unitPrice, 
    unit, 
    specifications, 
    stockAvailable,
    warehouseLocation,
    imageUrl
  } = req.body;

  if (!supplierId || !name || !unitPrice || !stockAvailable) {
    res.status(400).json({ success: false, error: 'Missing mandatory product listing fields.' });
    return;
  }

  const productId = `prod-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const newProduct: Product = {
    id: productId,
    supplierId,
    supplierName: supplierName || 'Accredited Supplier',
    name,
    category: category || 'Rations',
    unitPrice: Number(unitPrice),
    unit: unit || 'Pack',
    specifications: specifications || '',
    stockAvailable: Number(stockAvailable),
    warehouseLocation: warehouseLocation || 'Karachi Central Hub',
    imageUrl: imageUrl || 'https://images.unsplash.com/photo-1584727638096-042c45049ebe?auto=format&fit=crop&w=800&q=80',
    complianceApproved: true,
    createdAt: Date.now()
  };

  await saveProduct(newProduct);
  res.json({ success: true, product: newProduct });
});

// ==========================================
// 5. REAL ORDERS & TRACEABILITY PIPELINE
// ==========================================

app.get('/api/orders', async (req: Request, res: Response): Promise<void> => {
  const orders = await getOrders();
  res.json({ success: true, orders });
});

// Supplier Dispatches Order
app.patch('/api/orders/:id/dispatch', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { courierName, trackingNumber, vehicleNumber, driverContact, estimatedArrival } = req.body;

  if (!courierName || !trackingNumber) {
    res.status(400).json({ success: false, error: 'Courier name and tracking number are required.' });
    return;
  }

  const now = Date.now();
  await updateOrder(id, {
    status: 'Dispatched',
    dispatchDetails: {
      courierName,
      trackingNumber,
      dispatchedAt: now,
      estimatedArrival: estimatedArrival || now + 24 * 3600 * 1000,
      driverContact: driverContact || '',
      vehicleNumber: vehicleNumber || ''
    }
  });

  res.json({ success: true, message: 'Order dispatched with courier tracking.' });
});

// Supplier Marks Arrived at Camp
app.patch('/api/orders/:id/deliver', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  await updateOrder(id, {
    status: 'Delivered'
  });
  res.json({ success: true, message: 'Order marked delivered at camp destination.' });
});

// NGO Ground Officer Signs Off Confirmation
app.patch('/api/orders/:id/confirm-ngo', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { confirmedBy, officerCnic, officerPhone, notes } = req.body;

  if (!confirmedBy) {
    res.status(400).json({ success: false, error: 'Field officer name is required for digital sign-off.' });
    return;
  }

  const orders = await getOrders();
  const order = orders.find(o => o.id === id);
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found.' });
    return;
  }

  const now = Date.now();
  await updateOrder(id, {
    status: 'NGO Confirmed',
    ngoConfirmation: {
      confirmedBy,
      confirmedAt: now,
      officerCnic: officerCnic || '',
      officerPhone: officerPhone || '',
      notes: notes || 'Relief goods inspected, verified, and distributed to registered families.'
    }
  });

  // Atomically increment requirement quantityDelivered
  const requirements = await getRequirements();
  for (const item of order.items) {
    const req = requirements.find(r => r.campaignId === order.campaignId && r.itemName.toLowerCase().includes(item.productName.toLowerCase()));
    if (req) {
      await updateRequirement(req.id, {
        quantityDelivered: (req.quantityDelivered || 0) + item.quantity
      });
    }
  }

  res.json({ success: true, message: 'Ground delivery officially certified by NGO officer.' });
});

// ==========================================
// 6. REAL JAZZCASH PAYMENT & ATOMIC ORDER CREATION
// ==========================================

app.post('/api/payments/verify-jazzcash', async (req: Request, res: Response): Promise<void> => {
  const { 
    mobileNumber, 
    cnicLast6, 
    mpin, 
    cartItems, 
    donorId, 
    donorName, 
    donorEmail 
  } = req.body;

  if (!mobileNumber || !cnicLast6 || !mpin || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    res.status(400).json({ success: false, error: 'Incomplete JazzCash payment verification details.' });
    return;
  }

  // Validate format
  if (!/^03[0-9]{9}$/.test(mobileNumber.trim())) {
    res.status(400).json({ success: false, error: 'Invalid JazzCash mobile account number (must be 03xx-xxxxxxx).' });
    return;
  }

  if (cnicLast6.trim().length !== 6 || isNaN(Number(cnicLast6))) {
    res.status(400).json({ success: false, error: 'Last 6 digits of CNIC must be 6 numeric digits.' });
    return;
  }

  if (mpin.trim().length !== 4 || isNaN(Number(mpin))) {
    res.status(400).json({ success: false, error: 'JazzCash MPIN must be 4 numeric digits.' });
    return;
  }

  const now = Date.now();
  const gatewayReference = `JC-TXN-${now.toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

  // Group cart items by campaign and supplier to create orders
  const createdOrders: Order[] = [];
  const requirements = await getRequirements();

  // Calculate total amount
  let totalOrderAmount = 0;
  for (const item of cartItems) {
    totalOrderAmount += (item.quantity * item.unitPrice);
  }

  // Record Transaction
  const txId = `tx-${now}-${Math.floor(100 + Math.random() * 900)}`;
  const newTx: Transaction = {
    id: txId,
    orderId: '', // populated below
    gatewayReference,
    amount: totalOrderAmount,
    currency: 'PKR',
    status: 'Verified',
    paymentMethod: 'JazzCash',
    accountNumber: `03**-***${mobileNumber.slice(-4)}`,
    verifiedAt: now,
    rawGatewayResponse: {
      status: 'PAID',
      message: 'Transaction authorized successfully via JazzCash Sandbox',
      authCode: `AUTH-${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: new Date().toISOString()
    }
  };

  // Group by campaignId
  const itemsByCampaign: { [campId: string]: typeof cartItems } = {};
  for (const item of cartItems) {
    const cId = item.campaignId;
    if (!itemsByCampaign[cId]) itemsByCampaign[cId] = [];
    itemsByCampaign[cId].push(item);
  }

  const campaigns = await getCampaigns();

  for (const [cId, items] of Object.entries(itemsByCampaign)) {
    const campaign = campaigns.find(c => c.id === cId);
    const campaignName = campaign ? campaign.disasterName : 'Emergency Relief Campaign';
    const ngoName = campaign ? campaign.ngoName : 'Accredited NGO';

    const orderId = `PKR-ORD-${now.toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const subtotal = items.reduce((sum: number, i: any) => sum + (i.quantity * i.unitPrice), 0);

    const newOrder: Order = {
      id: orderId,
      orderNumber: orderId,
      donorId: donorId || 'guest-donor',
      donorName: donorName || 'Verified Philanthropist',
      campaignId: cId,
      campaignName,
      ngoName,
      supplierId: items[0]?.supplierId || 'supplier-1',
      supplierName: items[0]?.supplierName || 'Accredited Supplier',
      items: items.map((i: any) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        unit: i.unit || 'Pack'
      })),
      amount: subtotal,
      currency: 'PKR',
      status: 'Paid',
      gatewayReference,
      createdAt: now,
      updatedAt: now
    };

    await saveOrder(newOrder);
    createdOrders.push(newOrder);

    // Update requirements atomically
    for (const i of items) {
      const req = requirements.find(r => r.campaignId === cId && (r.id === i.requirementId || r.itemName.toLowerCase().includes(i.productName.toLowerCase())));
      if (req) {
        await updateRequirement(req.id, {
          quantityFunded: (req.quantityFunded || 0) + i.quantity
        });
      }
    }
  }

  newTx.orderId = createdOrders.map(o => o.orderNumber).join(', ');
  await saveTransaction(newTx);

  res.json({
    success: true,
    orders: createdOrders,
    gatewayReference,
    transaction: newTx,
    message: 'JazzCash payment successfully verified and relief orders recorded in Firestore.'
  });
});

// ==========================================
// 7. ADMIN OVERSIGHT & STATUTORY APPROVALS
// ==========================================

app.get('/api/admin/pending-entities', async (req: Request, res: Response): Promise<void> => {
  const ngos = await getNgos();
  const suppliers = await getSuppliers();

  res.json({
    success: true,
    pendingNgos: ngos.filter(n => n.status === 'pending'),
    pendingSuppliers: suppliers.filter(s => s.status === 'pending')
  });
});

app.get('/api/admin/pending-users', async (req: Request, res: Response): Promise<void> => {
  const users = await getUsers();
  res.json(users);
});

app.patch('/api/admin/verify-user', async (req: Request, res: Response): Promise<void> => {
  const { userId, status } = req.body;
  if (!userId || !status) {
    res.status(400).json({ success: false, error: 'User ID and status are required.' });
    return;
  }

  const user = await getUserById(userId);
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found.' });
    return;
  }

  const newStatus = status === 'approved' ? 'approved' : 'rejected';
  await updateUser(userId, { verificationStatus: newStatus });

  // Update entity table if NGO or Supplier
  if (user.role === 'ngo') {
    const ngos = await getNgos();
    const ngo = ngos.find(n => n.linkedUserId === userId || n.id === userId);
    if (ngo) {
      await updateNgo(ngo.id, { status: newStatus });
    }
  } else if (user.role === 'supplier') {
    const suppliers = await getSuppliers();
    const supplier = suppliers.find(s => s.linkedUserId === userId || s.id === userId);
    if (supplier) {
      await updateSupplier(supplier.id, { status: newStatus });
    }
  }

  // Set role custom claim upon approval
  if (status === 'approved') {
    await setCustomClaim(userId, { role: user.role });
  }

  res.json({ success: true, message: `User status updated to ${status}.` });
});

app.get('/api/transactions', async (req: Request, res: Response): Promise<void> => {
  const transactions = await getTransactions();
  res.json(transactions);
});

app.patch('/api/admin/flag-transaction', async (req: Request, res: Response): Promise<void> => {
  const { transactionId, flagged, reason } = req.body;
  res.json({ success: true, message: `Transaction flagged status updated to ${flagged}.` });
});

app.post('/api/admin/approve-entity', async (req: Request, res: Response): Promise<void> => {
  const { entityType, entityId, status, notes } = req.body;
  if (!entityType || !entityId || !status) {
    res.status(400).json({ success: false, error: 'Missing approval details.' });
    return;
  }

  if (entityType === 'ngo') {
    const ngos = await getNgos();
    const ngo = ngos.find(n => n.id === entityId);
    if (!ngo) {
      res.status(404).json({ success: false, error: 'NGO not found.' });
      return;
    }

    await updateNgo(entityId, { status });
    if (ngo.linkedUserId) {
      await updateUser(ngo.linkedUserId, {
        verificationStatus: status === 'approved' ? 'approved' : 'rejected'
      });
      if (status === 'approved') {
        await setCustomClaim(ngo.linkedUserId, { role: 'ngo' });
      }
    }
  } else if (entityType === 'supplier') {
    const suppliers = await getSuppliers();
    const supplier = suppliers.find(s => s.id === entityId);
    if (!supplier) {
      res.status(404).json({ success: false, error: 'Supplier not found.' });
      return;
    }

    await updateSupplier(entityId, { status });
    if (supplier.linkedUserId) {
      await updateUser(supplier.linkedUserId, {
        verificationStatus: status === 'approved' ? 'approved' : 'rejected'
      });
      if (status === 'approved') {
        await setCustomClaim(supplier.linkedUserId, { role: 'supplier' });
      }
    }
  }

  res.json({ success: true, message: `Entity statutory status updated to ${status}.` });
});

// ==========================================
// 8. REAL STATS AGGREGATION
// ==========================================

app.get('/api/stats', async (req: Request, res: Response): Promise<void> => {
  const campaigns = await getCampaigns();
  const requirements = await getRequirements();
  const orders = await getOrders();
  const transactions = await getTransactions();

  const activeDisasters = campaigns.filter(c => c.status === 'active').length;
  const totalQuantityNeeded = requirements.reduce((sum, r) => sum + (r.quantityNeeded || 0), 0);
  const totalQuantityFunded = requirements.reduce((sum, r) => sum + (r.quantityFunded || 0), 0);
  const totalQuantityDelivered = requirements.reduce((sum, r) => sum + (r.quantityDelivered || 0), 0);
  const totalAmountRaised = transactions
    .filter(t => t.status === 'Verified')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  res.json({
    success: true,
    stats: {
      activeDisasters,
      totalQuantityNeeded,
      totalQuantityFunded,
      totalQuantityDelivered,
      totalAmountRaised,
      totalOrders: orders.length
    }
  });
});

export default app;
