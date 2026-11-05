import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import { 
  getUsers, 
  getUserById, 
  saveUser, 
  updateUser,
  removeLegacyPassword,
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
  getCampaignById,
  saveCampaign,
  reviewCampaignTransaction,
  claimSocialPlatformPublication,
  updateSocialPlatformPublication,
  getOptedInWhatsAppSupporters,
  claimWhatsAppRecipient,
  authorizeWhatsAppDispatch,
  updateWhatsAppRecipientPublication,
  reconcileStaleSocialPublication,
  updateWhatsAppConsent,
  getRequirements, 
  saveRequirement, 
  updateRequirement,
  getProducts, 
  getProductById,
  saveProduct,
  updateProduct,
  getOrders, 
  getOrderById,
  saveOrder, 
  updateOrder,
  OrderTransitionError,
  transitionOrderStatus,
  createDemoPendingCheckout,
  expirePendingDemoOrders,
  getTransactionsByDonor,
  getTransactions, 
  saveTransaction
} from './firestoreService';
import { sendOtpEmail } from './emailService';
import { assertFirebaseEmailAvailable, migrateLegacyUserToFirebaseAuth, setCustomClaim, verifyFirebaseIdToken } from './adminAuthService';
import { AuthenticatedRequest, createAuthMiddleware } from './authMiddleware';
import { createCampaignWorkflowRouter } from './campaignWorkflow';
import { hasValidAdminCampaignApproval } from './campaignReviewPolicy';
import { createSocialMediaService } from './socialMediaService';
import { CheckoutValidationError, normalizeCheckoutLines } from './commerceService';
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

import crypto from 'crypto';

const provisionedAdminUids = new Set((process.env.PAKRELIEF_ADMIN_UIDS || '')
  .split(',')
  .map(uid => uid.trim())
  .filter(Boolean));

const { requireFirebaseIdentity, requireAuth, requireAdmin, requireDonor, requireNgo, requireSupplier } = createAuthMiddleware({
  verifyToken: verifyFirebaseIdToken,
  getUserById,
  isAdminUid: uid => provisionedAdminUids.has(uid)
});

const optionalAuth: express.RequestHandler = (req, res, next) => {
  if (!req.headers.authorization) {
    next();
    return;
  }
  requireAuth(req, res, next);
};

async function getApprovedSupplierForUser(userId: string): Promise<SupplierProfile | null> {
  const suppliers = await getSuppliers();
  return suppliers.find(supplier => supplier.linkedUserId === userId && supplier.status === 'approved') || null;
}

const socialMediaService = createSocialMediaService({
  isAdminUid: uid => provisionedAdminUids.has(uid),
  repository: {
    getCampaign: getCampaignById,
    claimPlatform: (campaignId, platform, retry, now, isAdminUid) =>
      claimSocialPlatformPublication(campaignId, platform, retry, now, isAdminUid),
    updatePlatform: updateSocialPlatformPublication,
    getOptedInSupporters: getOptedInWhatsAppSupporters,
    claimWhatsAppRecipient,
    authorizeWhatsAppDispatch,
    updateWhatsAppRecipient: updateWhatsAppRecipientPublication
  }
});

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, actualSalt, 1000, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return computed === hash;
}

// Initialize statutory admin identifier mapping in Firestore
export async function initializeStatutoryAdmin(): Promise<void> {
  try {
    const adminEmail = 'admin@pakrelief.gov.pk';
    const adminUid = 'admin_ndma_root';
    const existingUser = await getUserById(adminUid);
    const bootstrapPassword = process.env.PAKRELIEF_ADMIN_BOOTSTRAP_PASSWORD;
    if (!existingUser && !bootstrapPassword) {
      console.warn('[PakRelief] Admin profile bootstrap skipped; configure PAKRELIEF_ADMIN_BOOTSTRAP_PASSWORD securely.');
      return;
    }

    const existing = await getIdentifierMapping(adminEmail);

    if (!existing) {
      await saveIdentifierMapping(adminEmail, {
        identifier: adminEmail,
        email: adminEmail,
        role: 'admin',
        userId: adminUid,
        name: 'National Disaster Management Authority (Admin)',
        verificationStatus: 'approved'
      });
      console.log('[PakRelief] Initialized NDMA statutory admin mapping in Firestore');
    }

    if (!existingUser) {
      const { hash, salt } = hashPassword(bootstrapPassword!);
      await saveUser({
        id: adminUid,
        firebaseUid: adminUid,
        email: adminEmail,
        name: 'NDMA Statutory Admin',
        role: 'admin',
        contact: '+92 51 9205037',
        emailVerified: true,
        verificationStatus: 'active',
        createdAt: Date.now(),
        identifier: adminEmail,
        passwordHash: hash,
        passwordSalt: salt
      });
      console.log('[PakRelief] Initialized NDMA statutory admin profile in Firestore');
    }
  } catch (err) {
    console.warn('[PakRelief] Warning initializing admin mapping:', err);
  }
}

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

app.post('/api/auth/register-profile', requireFirebaseIdentity, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

  if (!role || !identifier) {
    res.status(400).json({ success: false, error: 'Missing mandatory registration fields.' });
    return;
  }

  const verifiedUid = req.user?.uid;
  const verifiedEmail = req.user?.email;
  if (!verifiedUid || !verifiedEmail || (uid && uid !== verifiedUid)) {
    res.status(403).json({ success: false, error: 'Registration identity must match the verified Firebase account.' });
    return;
  }

  if (!['donor', 'ngo', 'supplier'].includes(role)) {
    res.status(400).json({ success: false, error: 'Self-registration is limited to donor, NGO, and supplier accounts.' });
    return;
  }

  if (await getUserById(verifiedUid)) {
    res.status(409).json({ success: false, error: 'A profile already exists for this Firebase account.' });
    return;
  }

  const now = Date.now();
  const normalizedEmail = verifiedEmail.trim().toLowerCase();
  if (await getIdentifierMapping(identifier) || await getIdentifierMapping(normalizedEmail)) {
    res.status(409).json({ success: false, error: 'This identifier or email is already registered. Contact support if this is your account.' });
    return;
  }
  const isDonor = role === 'donor';
  const initialStatus = isDonor ? 'approved' : 'pending';

  // 1. Create UserProfile in Firestore
  const userProfile: UserProfile = {
    id: verifiedUid,
    firebaseUid: verifiedUid,
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

  // Server authorization uses the trusted profile and admin UID allowlist, not this donor claim.
  if (isDonor) {
    await setCustomClaim(verifiedUid, { role });
  }

  res.json({
    success: true,
    user: userProfile,
    message: initialStatus === 'pending'
      ? 'Registration submitted! Your statutory documents are awaiting NDMA Admin approval.'
      : 'Account registered and verified successfully.'
  });
});

// Legacy Registration Migration (server provisions Firebase Auth when client email/password auth is unavailable)
app.post('/api/auth/register-direct', async (req: Request, res: Response): Promise<void> => {
  const { 
    email, 
    password, 
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

  if (!email || !password || !role || !identifier) {
    res.status(400).json({ success: false, error: 'Missing mandatory registration fields.' });
    return;
  }

  if (!['donor', 'ngo', 'supplier'].includes(role)) {
    res.status(400).json({ success: false, error: 'Self-registration is limited to donor, NGO, and supplier accounts.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedIdentifier = identifier.trim();
  if (await getIdentifierMapping(trimmedIdentifier) || await getIdentifierMapping(normalizedEmail)) {
    res.status(409).json({ success: false, error: 'This identifier or email is already registered. Sign in or contact support.' });
    return;
  }
  try {
    await assertFirebaseEmailAvailable(normalizedEmail);
  } catch (error: any) {
    const conflict = error.message?.startsWith('This email is already linked');
    res.status(conflict ? 409 : 503).json({ success: false, error: error.message });
    return;
  }

  const now = Date.now();
  const uid = `usr_${now}_${crypto.randomBytes(6).toString('hex')}`;
  const { hash, salt } = hashPassword(password);

  const isDonor = role === 'donor';
  const initialStatus = isDonor ? 'approved' : 'pending';

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
    identifier: trimmedIdentifier,
    passwordHash: hash,
    passwordSalt: salt
  };

  await saveUser(userProfile);

  await saveIdentifierMapping(trimmedIdentifier, {
    identifier: trimmedIdentifier,
    email: normalizedEmail,
    role,
    userId: uid,
    name: userProfile.name,
    verificationStatus: initialStatus
  });

  await saveIdentifierMapping(normalizedEmail, {
    identifier: normalizedEmail,
    email: normalizedEmail,
    role,
    userId: uid,
    name: userProfile.name,
    verificationStatus: initialStatus
  });

  if (role === 'ngo') {
    await saveNgo({
      id: uid,
      linkedUserId: uid,
      organizationName: name,
      registrationType: registrationType || 'SECP',
      registrationNumber: trimmedIdentifier,
      focalPerson: focalPerson || name,
      phone: contact || '',
      address: address || '',
      email: normalizedEmail,
      status: 'pending',
      createdAt: now
    });
  } else if (role === 'supplier') {
    await saveSupplier({
      id: uid,
      linkedUserId: uid,
      companyName: name,
      businessType: businessType || 'Distributor',
      cuinOrCnic: trimmedIdentifier,
      warehouseCity: warehouseCity || 'Karachi',
      phone: contact || '',
      email: normalizedEmail,
      status: 'pending',
      createdAt: now
    });
  }

  let customToken: string;
  try {
    customToken = await migrateLegacyUserToFirebaseAuth(uid, normalizedEmail, password, userProfile.name);
    await removeLegacyPassword(uid);
  } catch (error) {
    console.error('[PakRelief] Could not migrate direct registration to Firebase Auth:', error);
    const authError = error as { message?: string; code?: string };
    const conflict = authError.message?.startsWith('This email is already linked') ||
      authError.code === 'auth/email-already-exists' || authError.code === 'auth/uid-already-exists';
    res.status(conflict ? 409 : 503).json({
      success: false,
      error: conflict
        ? 'A Firebase account already owns this identity. The profile is retained; sign in with Firebase or contact support to reconcile it.'
        : 'The profile was created, but secure Firebase sign-in is unavailable. Your account is retained; contact support to complete sign-in.'
    });
    return;
  }

  res.json({
    success: true,
    user: userProfile,
    customToken,
    message: initialStatus === 'pending'
      ? 'Registration submitted! Your statutory documents are awaiting NDMA Admin approval.'
      : 'Account registered and verified successfully.'
  });
});

// Legacy Login Migration (the stored legacy password must verify before Firebase token issuance)
app.post('/api/auth/login-direct', async (req: Request, res: Response): Promise<void> => {
  const { identifier, role, password } = req.body;
  if (!identifier || !password) {
    res.status(400).json({ success: false, error: 'Identifier and password are required.' });
    return;
  }

  const trimmedIdentifier = identifier.trim();

  // 1. Resolve identifier
  const mapping = await getIdentifierMapping(trimmedIdentifier);
  if (!mapping) {
    res.status(404).json({ success: false, error: 'No account registered with this identifier. Please verify your credentials or sign up.' });
    return;
  }

  if (role && mapping.role !== role) {
    res.status(400).json({ success: false, error: `This identifier is registered as a ${mapping.role.toUpperCase()}, not ${role.toUpperCase()}.` });
    return;
  }

  // 2. Fetch user profile from Firestore
  let user: UserProfile | null = mapping.userId ? await getUserById(mapping.userId) : null;
  if (!user) {
    const allUsers = await getUsers();
    user = allUsers.find(u => u.email.toLowerCase() === mapping.email.toLowerCase()) || null;
  }

  if (!user) {
    res.status(404).json({ success: false, error: 'User profile not found in database.' });
    return;
  }

  // 3. Verify password
  if (user.role === 'admin') {
    const bootstrapPassword = process.env.PAKRELIEF_ADMIN_BOOTSTRAP_PASSWORD;
    if (!bootstrapPassword) {
      res.status(503).json({
        success: false,
        error: 'Legacy administrator sign-in requires PAKRELIEF_ADMIN_BOOTSTRAP_PASSWORD. Existing Firebase administrator sign-in remains available.'
      });
      return;
    }
    if (password !== bootstrapPassword) {
      res.status(401).json({ success: false, error: 'Incorrect administrator credentials.' });
      return;
    }
    const { hash, salt } = hashPassword(password);
    await updateUser(user.id, { passwordHash: hash, passwordSalt: salt });
  } else if (user.passwordHash && user.passwordSalt) {
    const valid = verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!valid) {
      res.status(401).json({ success: false, error: 'Incorrect password. Please verify and try again.' });
      return;
    }
  } else {
    res.status(409).json({
      success: false,
      error: 'This profile has no verified legacy password. Sign in with Firebase or contact support to recover the account.'
    });
    return;
  }

  let customToken: string;
  try {
    customToken = await migrateLegacyUserToFirebaseAuth(user.id, user.email, password, user.name);
    await removeLegacyPassword(user.id);
  } catch (error) {
    console.error('[PakRelief] Could not migrate direct login to Firebase Auth:', error);
    const authError = error as { message?: string; code?: string };
    const conflict = authError.message?.startsWith('A Firebase identity already exists') ||
      authError.message?.startsWith('This email is already linked');
    res.status(conflict ? 409 : 503).json({
      success: false,
      error: conflict
        ? authError.message
        : 'Your legacy password was verified, but secure Firebase sign-in is unavailable. Your account remains intact; contact support to complete migration.'
    });
    return;
  }

  res.json({
    success: true,
    user,
    customToken,
    message: 'Signed in successfully via secure PakRelief authentication.'
  });
});

// Profile Lookup by Token
app.get('/api/auth/profile', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.profile) {
    res.status(404).json({ success: false, error: 'User profile not found in Firestore.' });
    return;
  }

  res.json({ success: true, user: req.profile });
});

app.patch('/api/auth/whatsapp-consent', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (req.profile?.role !== 'donor') {
    res.status(403).json({ success: false, error: 'WhatsApp campaign notifications are available to supporter accounts.' });
    return;
  }
  const { optIn, phone } = req.body;
  if (typeof optIn !== 'boolean') {
    res.status(400).json({ success: false, error: 'An explicit optIn boolean is required.' });
    return;
  }
  try {
    await updateWhatsAppConsent(req.profile.id, optIn, typeof phone === 'string' ? phone : undefined);
    res.json({ success: true, whatsappOptIn: optIn });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'WhatsApp consent could not be updated.'
    });
  }
});

// ==========================================
// 3. REAL DISASTER CAMPAIGNS & REQUIREMENTS
// ==========================================

app.use('/api', createCampaignWorkflowRouter({
  requireAuth,
  requireAdmin,
  getCampaigns,
  getRequirements,
  reviewCampaign: reviewCampaignTransaction,
  publishApprovedCampaign: socialMediaService.publishApprovedCampaign,
  retryPlatform: socialMediaService.retryPlatform,
  getCampaign: getCampaignById,
  hasValidApproval: campaign => hasValidAdminCampaignApproval(campaign, uid => provisionedAdminUids.has(uid)),
  reconcileStalePublication: reconcileStaleSocialPublication
}));

app.post('/api/campaigns', requireAuth, requireNgo, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { 
    disasterName, 
    disasterType, 
    location, 
    province, 
    description, 
    urgentNotice,
    targetBeneficiaries,
    campCoordinates,
    photoUrl,
    requirements
  } = req.body;

  if (!disasterName || !location || !province) {
    res.status(400).json({ success: false, error: 'Missing required campaign information.' });
    return;
  }

  const ngoUser = req.profile;
  if (!ngoUser || ngoUser.verificationStatus !== 'approved') {
    res.status(403).json({ success: false, error: 'Only an approved NGO may submit campaigns.' });
    return;
  }
  const ngos = await getNgos();
  const ngoProfile = ngos.find(ngo => ngo.linkedUserId === ngoUser.id && ngo.status === 'approved');
  if (!ngoProfile) {
    res.status(403).json({ success: false, error: 'An approved NGO organization profile is required to submit campaigns.' });
    return;
  }

  const campaignId = `camp-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const now = Date.now();

  const newCampaign: Campaign = {
    id: campaignId,
    ngoId: ngoUser.id,
    ngoName: ngoProfile.organizationName || ngoUser.name,
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
    status: 'pending_review'
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
  const campaigns = (await getCampaigns()).filter(campaign => campaign.status === 'approved' || campaign.status === 'active');
  const visibleCampaignIds = new Set(campaigns.map(campaign => campaign.id));
  if (campaignId && !visibleCampaignIds.has(campaignId)) {
    res.json({ success: true, requirements: [] });
    return;
  }
  const requirements = (await getRequirements(campaignId)).filter(requirement => visibleCampaignIds.has(requirement.campaignId));
  res.json({ success: true, requirements });
});

app.post('/api/requirements', requireAuth, requireNgo, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

  if (!req.profile || req.profile.verificationStatus !== 'approved') {
    res.status(403).json({ success: false, error: 'Only an approved NGO may add campaign requirements.' });
    return;
  }
  const campaign = await (await getCampaigns()).find(item => item.id === campaignId);
  if (!campaign || campaign.ngoId !== req.profile.id || !['pending_review', 'approved', 'active'].includes(campaign.status)) {
    res.status(403).json({ success: false, error: 'Requirements may only be added to your own eligible campaign.' });
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
  await expirePendingDemoOrders();
  const supplierId = req.query.supplierId as string | undefined;
  const products = await getProducts(supplierId);
  res.json({ success: true, products });
});

app.post('/api/products', requireAuth, requireSupplier, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { 
    name, 
    category, 
    unitPrice, 
    price,
    unit, 
    specifications, 
    stockAvailable,
    stock,
    warehouseLocation,
    location,
    imageUrl
  } = req.body;

  const supplierProfile = req.profile ? await getApprovedSupplierForUser(req.profile.id) : null;
  if (!supplierProfile || req.profile?.verificationStatus !== 'approved') {
    res.status(403).json({ success: false, error: 'An approved supplier account is required to list products.' });
    return;
  }

  const serverUnitPrice = Number(unitPrice ?? price);
  const serverStock = Number(stockAvailable ?? stock);
  if (typeof name !== 'string' || !name.trim() || !Number.isSafeInteger(serverUnitPrice) || serverUnitPrice <= 0 || !Number.isSafeInteger(serverStock) || serverStock < 0) {
    res.status(400).json({ success: false, error: 'Missing mandatory product listing fields.' });
    return;
  }

  const productId = `prod-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const newProduct: Product = {
    id: productId,
    supplierId: req.profile!.id,
    supplierName: supplierProfile.companyName,
    name: name.trim(),
    category: category || 'Rations',
    unitPrice: serverUnitPrice,
    unit: unit || 'Pack',
    specifications: specifications || '',
    stockAvailable: serverStock,
    warehouseLocation: warehouseLocation || location || supplierProfile.warehouseCity,
    imageUrl: imageUrl || 'https://images.unsplash.com/photo-1584727638096-042c45049ebe?auto=format&fit=crop&w=800&q=80',
    complianceApproved: true,
    status: 'approved',
    createdAt: Date.now()
  };

  await saveProduct(newProduct);
  res.json({ success: true, product: newProduct });
});

app.patch('/api/products/:productId', requireAuth, requireSupplier, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supplierProfile = req.profile ? await getApprovedSupplierForUser(req.profile.id) : null;
  if (!supplierProfile || req.profile?.verificationStatus !== 'approved') {
    res.status(403).json({ success: false, error: 'An approved supplier account is required to update products.' });
    return;
  }
  const product = await getProductById(req.params.productId);
  if (!product) {
    res.status(404).json({ success: false, error: 'Product not found.' });
    return;
  }
  if (product.supplierId !== req.profile!.id) {
    res.status(403).json({ success: false, error: 'Suppliers may only update their own products and stock.' });
    return;
  }

  const updates: Partial<Product> = {};
  const body = req.body as Record<string, unknown>;
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      res.status(400).json({ success: false, error: 'Product name is invalid.' });
      return;
    }
    updates.name = body.name.trim();
  }
  if (body.unitPrice !== undefined || body.price !== undefined) {
    const updatedPrice = Number(body.unitPrice ?? body.price);
    if (!Number.isSafeInteger(updatedPrice) || updatedPrice <= 0) {
      res.status(400).json({ success: false, error: 'Unit price must be a positive whole PKR amount.' });
      return;
    }
    updates.unitPrice = updatedPrice;
  }
  if (body.stockAvailable !== undefined || body.stock !== undefined) {
    const updatedStock = Number(body.stockAvailable ?? body.stock);
    if (!Number.isSafeInteger(updatedStock) || updatedStock < 0) {
      res.status(400).json({ success: false, error: 'Stock must be a non-negative whole number.' });
      return;
    }
    updates.stockAvailable = updatedStock;
  }
  if (body.category !== undefined && typeof body.category === 'string') updates.category = body.category;
  if (body.unit !== undefined && typeof body.unit === 'string') updates.unit = body.unit;
  if (body.specifications !== undefined && typeof body.specifications === 'string') updates.specifications = body.specifications;
  if (body.warehouseLocation !== undefined && typeof body.warehouseLocation === 'string') updates.warehouseLocation = body.warehouseLocation;
  if (body.location !== undefined && typeof body.location === 'string') updates.warehouseLocation = body.location;
  if (body.imageUrl !== undefined && typeof body.imageUrl === 'string') updates.imageUrl = body.imageUrl;

  await updateProduct(product.id, updates);
  res.json({ success: true, product: { ...product, ...updates } });
});

// ==========================================
// 5. REAL ORDERS & TRACEABILITY PIPELINE
// ==========================================

function toPublicOrder(order: Order): Order {
  return {
    ...order,
    donorId: 'public',
    donorName: 'Private supporter',
    donorEmail: undefined,
    donorCnic: undefined,
    amount: 0,
    gatewayReference: '',
    transactionId: undefined,
    paymentMethod: undefined,
    items: order.items.map(item => ({ ...item, unitPrice: 0 }))
  };
}

app.get('/api/orders', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  await expirePendingDemoOrders();
  const allOrders = await getOrders();
  const authenticatedRequest = req as AuthenticatedRequest;
  const profile = authenticatedRequest.profile;
  if (!profile) {
    res.json({ success: true, orders: allOrders.map(toPublicOrder) });
    return;
  }

  if (profile.role === 'donor') {
    res.json({ success: true, orders: allOrders.filter(order => order.donorId === profile.id || order.donorEmail === profile.email) });
    return;
  }
  if (profile.role === 'supplier') {
    const supplier = await getApprovedSupplierForUser(profile.id);
    if (!supplier || profile.verificationStatus !== 'approved') {
      res.status(403).json({ success: false, error: 'An approved supplier account is required to view supplier orders.' });
      return;
    }
    res.json({ success: true, orders: allOrders.filter(order => order.supplierId === profile.id) });
    return;
  }
  if (profile.role === 'ngo') {
    const ngos = await getNgos();
    if (profile.verificationStatus !== 'approved' || !ngos.some(ngo => ngo.linkedUserId === profile.id && ngo.status === 'approved')) {
      res.status(403).json({ success: false, error: 'An approved NGO account is required to view NGO deliveries.' });
      return;
    }
    const campaignIds = new Set((await getCampaigns()).filter(campaign => campaign.ngoId === profile.id).map(campaign => campaign.id));
    res.json({ success: true, orders: allOrders.filter(order => campaignIds.has(order.campaignId)) });
    return;
  }
  if (profile.role === 'admin' && authenticatedRequest.user?.uid && provisionedAdminUids.has(authenticatedRequest.user.uid)) {
    res.json({ success: true, orders: allOrders });
    return;
  }
  res.status(403).json({ success: false, error: 'Order access is not authorized for this account.' });
});

function sendOrderTransitionError(res: Response, error: unknown): void {
  if (error instanceof OrderTransitionError) {
    res.status(error.kind === 'forbidden' ? 403 : 409).json({ success: false, error: error.message });
    return;
  }
  res.status(500).json({ success: false, error: 'Order status could not be updated.' });
}

const dispatchOrder: express.RequestHandler = async (req, res) => {
  const authenticatedRequest = req as AuthenticatedRequest;
  const profile = authenticatedRequest.profile;
  const supplier = profile ? await getApprovedSupplierForUser(profile.id) : null;
  if (!profile || profile.verificationStatus !== 'approved' || !supplier) {
    res.status(403).json({ success: false, error: 'An approved supplier account is required.' });
    return;
  }
  const orderId = typeof req.params.id === 'string' ? req.params.id : req.body.orderId;
  const { courierName, trackingNumber, vehicleNumber, driverContact, contactPerson, estimatedArrival } = req.body;
  if (typeof orderId !== 'string' || typeof courierName !== 'string' || !courierName.trim() || typeof trackingNumber !== 'string' || !trackingNumber.trim()) {
    res.status(400).json({ success: false, error: 'Order ID, courier name, and tracking number are required.' });
    return;
  }
  const now = Date.now();
  try {
    const order = await transitionOrderStatus({
      orderId,
      actorId: profile.id,
      actorRole: 'supplier',
      allowedFrom: ['Payment Confirmed'],
      status: 'Dispatched',
      updates: {
        dispatchDetails: {
          courierName: courierName.trim(),
          trackingNumber: trackingNumber.trim(),
          dispatchedAt: now,
          estimatedArrival: Number.isFinite(Number(estimatedArrival)) ? Number(estimatedArrival) : now + 24 * 3600 * 1000,
          driverContact: typeof driverContact === 'string' ? driverContact : '',
          vehicleNumber: typeof vehicleNumber === 'string' ? vehicleNumber : '',
          contactPerson: typeof contactPerson === 'string' ? contactPerson : ''
        }
      }
    });
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found.' });
      return;
    }
    res.json({ success: true, order, message: 'Order dispatched with courier tracking.' });
  } catch (error) {
    sendOrderTransitionError(res, error);
  }
};

const deliverOrder: express.RequestHandler = async (req, res) => {
  const authenticatedRequest = req as AuthenticatedRequest;
  const profile = authenticatedRequest.profile;
  const supplier = profile ? await getApprovedSupplierForUser(profile.id) : null;
  if (!profile || profile.verificationStatus !== 'approved' || !supplier) {
    res.status(403).json({ success: false, error: 'An approved supplier account is required.' });
    return;
  }
  const orderId = typeof req.params.id === 'string' ? req.params.id : req.body.orderId;
  if (typeof orderId !== 'string' || !orderId) {
    res.status(400).json({ success: false, error: 'Order ID is required.' });
    return;
  }
  try {
    const order = await transitionOrderStatus({
      orderId,
      actorId: profile.id,
      actorRole: 'supplier',
      allowedFrom: ['Dispatched'],
      status: 'Delivered',
      updates: { deliveredAt: Date.now() }
    });
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found.' });
      return;
    }
    res.json({ success: true, order, message: 'Order marked delivered at camp destination.' });
  } catch (error) {
    sendOrderTransitionError(res, error);
  }
};

const confirmNgoOrder: express.RequestHandler = async (req, res) => {
  const authenticatedRequest = req as AuthenticatedRequest;
  const profile = authenticatedRequest.profile;
  const ngos = profile ? await getNgos() : [];
  if (!profile || profile.verificationStatus !== 'approved' || !ngos.some(ngo => ngo.linkedUserId === profile.id && ngo.status === 'approved')) {
    res.status(403).json({ success: false, error: 'An approved NGO account is required to confirm delivery.' });
    return;
  }
  const orderId = typeof req.params.id === 'string' ? req.params.id : req.body.orderId;
  const { confirmedBy, officerCnic, officerPhone, notes, distributionProofUrl } = req.body;
  if (typeof orderId !== 'string' || typeof confirmedBy !== 'string' || !confirmedBy.trim()) {
    res.status(400).json({ success: false, error: 'Order ID and field officer name are required.' });
    return;
  }
  const confirmedAt = Date.now();
  try {
    const order = await transitionOrderStatus({
      orderId,
      actorId: profile.id,
      actorRole: 'ngo',
      allowedFrom: ['Delivered'],
      status: 'NGO Confirmed',
      confirmedAt,
      updates: {
        ngoConfirmation: {
          confirmedBy: confirmedBy.trim(),
          confirmedAt,
          officerCnic: typeof officerCnic === 'string' ? officerCnic : '',
          officerPhone: typeof officerPhone === 'string' ? officerPhone : '',
          notes: typeof notes === 'string' ? notes : 'Relief goods inspected and verified at the camp.',
          distributionProofUrl: typeof distributionProofUrl === 'string' ? distributionProofUrl : undefined
        }
      }
    });
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found.' });
      return;
    }
    res.json({ success: true, order, message: 'Ground delivery officially certified by NGO officer.' });
  } catch (error) {
    sendOrderTransitionError(res, error);
  }
};

app.patch('/api/orders/:id/dispatch', requireAuth, requireSupplier, dispatchOrder);
app.post('/api/orders/dispatch', requireAuth, requireSupplier, dispatchOrder);
app.patch('/api/orders/:id/deliver', requireAuth, requireSupplier, deliverOrder);
app.post('/api/orders/deliver', requireAuth, requireSupplier, deliverOrder);
app.patch('/api/orders/:id/confirm-ngo', requireAuth, requireNgo, confirmNgoOrder);
app.post('/api/orders/confirm-receipt', requireAuth, requireNgo, confirmNgoOrder);

// Compatibility endpoint: this is a demo reservation, never a gateway verification.
app.post('/api/payments/verify-jazzcash', requireAuth, requireDonor, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.profile) {
    res.status(401).json({ success: false, error: 'Authenticated donor profile is required.' });
    return;
  }
  const { requestId, cartItems } = req.body;
  if (typeof requestId !== 'string' || requestId.length < 16 || requestId.length > 128) {
    res.status(400).json({ success: false, error: 'A unique checkout requestId is required.' });
    return;
  }

  try {
    const lines = normalizeCheckoutLines(cartItems);
    const result = await createDemoPendingCheckout({ donor: req.profile, requestId, lines });
    res.status(result.replayed ? 200 : 201).json({
      success: true,
      demo: true,
      paymentStatus: 'Pending',
      orders: result.orders,
      transactions: result.transactions,
      gatewayReference: result.transactions[0]?.gatewayReference,
      replayed: result.replayed,
      message: 'Demo order reserved. No payment was submitted, received, or verified.'
    });
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      res.status(400).json({ success: false, demo: true, error: error.message });
      return;
    }
    console.error('[PakRelief] Demo checkout failed:', error);
    res.status(409).json({ success: false, demo: true, error: 'The cart changed or inventory is unavailable. Refresh and try again.' });
  }
});

// ==========================================
// 7. ADMIN OVERSIGHT & STATUTORY APPROVALS
// ==========================================

app.get('/api/admin/pending-entities', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const ngos = await getNgos();
  const suppliers = await getSuppliers();

  res.json({
    success: true,
    pendingNgos: ngos.filter(n => n.status === 'pending'),
    pendingSuppliers: suppliers.filter(s => s.status === 'pending')
  });
});

app.get('/api/admin/pending-users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const users = await getUsers();
  res.json(users);
});

app.patch('/api/admin/verify-user', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

app.get('/api/transactions', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (req.profile?.role === 'donor') {
    res.json({ success: true, transactions: await getTransactionsByDonor(req.profile.id) });
    return;
  }
  if (req.profile?.role === 'admin' && req.user?.uid && provisionedAdminUids.has(req.user.uid)) {
    res.json({ success: true, transactions: await getTransactions() });
    return;
  }
  res.status(403).json({ success: false, error: 'Payment record access is not authorized for this account.' });
});

app.patch('/api/admin/flag-transaction', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { transactionId, flagged, reason } = req.body;
  res.json({ success: true, message: `Transaction flagged status updated to ${flagged}.` });
});

app.post('/api/admin/approve-entity', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
