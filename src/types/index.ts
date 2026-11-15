export type UserRole = 'donor' | 'ngo' | 'supplier' | 'admin';

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'active';

export interface UserProfile {
  id: string;
  firebaseUid: string;
  email: string;
  name: string;
  role: UserRole;
  contact?: string;
  cnic?: string;
  emailVerified: boolean;
  verificationStatus: VerificationStatus;
  createdAt: number;
  identifier?: string;
  passwordHash?: string;
  passwordSalt?: string;
  rejectionReason?: string;
  whatsappPhone?: string;
  whatsappOptIn?: boolean;
  whatsappOptedInAt?: number;
  whatsappOptedOutAt?: number;
  ngoDetails?: {
    organizationName?: string;
    registrationType?: 'SECP' | 'Society' | 'Trust' | 'VSWA';
    registrationNumber?: string;
    focalPerson?: string;
    address?: string;
  };
  supplierDetails?: {
    companyName?: string;
    businessType?: 'Business' | 'Sole Proprietor';
    cuinOrCnic?: string;
    cuinOrCnicType?: 'CUIN' | 'CNIC';
    warehouseCity?: string;
  };
}

export type User = UserProfile;

export interface NgoProfile {
  id: string;
  linkedUserId: string;
  organizationName: string;
  registrationType: 'SECP' | 'Society' | 'Trust' | 'VSWA';
  registrationNumber: string;
  focalPerson: string;
  phone: string;
  address: string;
  status: VerificationStatus;
  email?: string;
  verificationDocs?: string[];
  bankAccountTitle?: string;
  verifiedAt?: number;
  createdAt?: number;
}

export interface SupplierProfile {
  id: string;
  linkedUserId: string;
  companyName: string;
  businessType: 'Business' | 'Sole Proprietor' | 'Distributor';
  cuinOrCnic: string;
  cuinOrCnicType?: 'CUIN' | 'CNIC';
  warehouseCity: string;
  focalPerson?: string;
  phone: string;
  email?: string;
  status: VerificationStatus;
  verificationDocs?: string[];
  bankName?: string;
  bankIban?: string;
  verifiedAt?: number;
  createdAt?: number;
}

export type DisasterType = 'Flood' | 'Earthquake' | 'Drought' | 'Heatwave' | 'Displaced Persons' | 'Emergency Medical';

export type UrgencyLevel = 'Critical' | 'High' | 'Medium';

export type ItemCategory = 
  | 'Food Rations'
  | 'Clean Water & Filtration'
  | 'Medical Supplies'
  | 'Shelter & Tents'
  | 'Hygiene Kits'
  | 'Warm Blankets & Clothing';

export interface Campaign {
  id: string;
  disasterName: string;
  disasterType: DisasterType | string;
  province: string;
  district?: string;
  location: string;
  description: string;
  photoUrl: string;
  targetBeneficiaries: number;
  ngoId: string;
  ngoName: string;
  ngoRegNumber?: string;
  campCoordinates?: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'completed' | 'active';
  createdAt: number;
  urgentNotice?: string;
  reviewedByAdminId?: string;
  reviewedByAdminName?: string;
  reviewedAt?: number;
  reviewNotes?: string;
  socialPublishing?: CampaignSocialPublishing;
  requirements?: Requirement[];
}

export type SocialPlatform = 'facebook' | 'instagram' | 'whatsapp';
export type SocialPublicationStatus = 'pending' | 'publishing' | 'published' | 'failed';

export interface SocialPlatformPublication {
  status: SocialPublicationStatus;
  attempts: number;
  updatedAt: number;
  publishedId?: string;
  containerId?: string;
  error?: string;
  errorCode?: string;
  retryAfter?: number;
  retryable?: boolean;
  acceptedCount?: number;
  failedCount?: number;
}

export interface CampaignSocialPublishing {
  facebook: SocialPlatformPublication;
  instagram: SocialPlatformPublication;
  whatsapp: SocialPlatformPublication;
}

export interface Requirement {
  id: string;
  campaignId: string;
  itemName: string;
  itemType?: string;
  category: ItemCategory | string;
  quantityNeeded: number;
  quantityFunded: number;
  quantityReserved?: number;
  quantityDelivered: number;
  urgency: UrgencyLevel | string;
  deadline: string | number;
  unit: string;
  estimatedUnitPrice?: number;
  estimatedUnitCost?: number;
  specifications?: string;
  status?: 'pending_review' | 'approved' | 'rejected';
  createdAt?: number;
}

export interface Product {
  id: string;
  supplierId: string;
  supplierName: string;
  name: string;
  category: ItemCategory | string;
  price?: number; // in PKR
  unitPrice: number;
  stock?: number;
  stockAvailable: number;
  unit: string;
  specifications: string;
  location?: string;
  warehouseLocation?: string;
  status?: 'pending_review' | 'approved' | 'rejected';
  complianceApproved?: boolean;
  createdAt: number;
  imageUrl?: string;
}

export type OrderStatus = 
  | 'Payment Pending'
  | 'Payment Expired'
  | 'Paid'
  | 'Payment Confirmed'
  | 'Dispatched'
  | 'Delivered'
  | 'NGO Confirmed';

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  requirementId?: string;
  campaignId?: string;
  itemType?: string;
}

export interface OrderDispatchDetails {
  courierName: string;
  trackingNumber: string;
  vehicleNumber?: string;
  contactPerson?: string;
  driverContact?: string;
  estimatedArrival?: number;
  dispatchedAt: number;
}

export interface OrderNgoConfirmation {
  confirmedBy: string;
  confirmedAt: number;
  notes: string;
  officerCnic?: string;
  officerPhone?: string;
  distributionProofUrl?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  items: OrderItem[];
  donorId: string;
  donorName: string;
  donorEmail?: string;
  donorCnic?: string;
  supplierId: string;
  supplierName: string;
  ngoId?: string;
  ngoName: string;
  campaignId: string;
  campaignName: string;
  amount: number;
  currency?: string;
  status: OrderStatus;
  gatewayReference: string;
  transactionId?: string;
  reservationExpiresAt?: number;
  checkoutRequestId?: string;
  /** Safepay checkout aggregate this order belongs to (one session -> N grouped orders). */
  checkoutId?: string;
  paymentMethod?: string;
  paymentConfirmedAt?: number;
  createdAt: number;
  updatedAt?: number;
  dispatchDetails?: OrderDispatchDetails;
  deliveredAt?: number;
  ngoConfirmation?: OrderNgoConfirmation;
}

export interface Transaction {
  id: string;
  gatewayReference: string;
  orderId: string;
  orderNumber?: string;
  donorId?: string;
  checkoutRequestId?: string;
  checkoutId?: string;
  amount: number;
  currency?: string;
  paymentMethod: 'JazzCash Sandbox' | 'JazzCash' | 'Safepay' | string;
  senderMobile?: string;
  accountNumber?: string;
  cnic?: string;
  status?: 'Verified' | 'Pending' | 'Expired' | 'Failed' | 'Cancelled' | 'Flagged' | 'Refunded' | string;
  verifiedStatus?: 'verified' | 'flagged' | 'refunded';
  timestamp?: number;
  verifiedAt?: number;
  createdAt?: number;
  donorName?: string;
  flagged?: boolean;
  verifiedByBackend?: boolean;
  safepayTracker?: string;
  gatewayState?: string;
  failureReason?: string;
  rawGatewayResponse?: any;
}

/** Server-authoritative Safepay hosted-checkout payment state. */
export type SafepayPaymentStatus =
  | 'initiating'
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'requires_review';

/**
 * One Safepay payment session aggregates the N grouped orders produced by a single
 * donor cart. Payment is only ever confirmed by a signature-verified webhook or a
 * server-to-server tracker reconciliation — never by a frontend redirect.
 */
export interface SafepayCheckout {
  id: string;
  donorId: string;
  checkoutRequestId: string;
  idempotencyId: string;
  orderIds: string[];
  transactionIds: string[];
  lines: Array<{ productId: string; requirementId: string; campaignId: string; quantity: number }>;
  amount: number;
  amountMinor: number;
  currency: string;
  environment: 'sandbox' | 'production';
  paymentStatus: SafepayPaymentStatus;
  tracker?: string | null;
  checkoutUrl?: string | null;
  gatewayState?: string | null;
  reservationExpiresAt: number;
  lastError?: string | null;
  confirmedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CartItem {
  requirementId: string;
  campaignId: string;
  campaignName: string;
  ngoId: string;
  ngoName: string;
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  itemType?: string;
  category: ItemCategory | string;
  quantity: number;
  unitPrice: number;
  unit: string;
  maxNeededRemaining?: number;
}

export interface OtpRecord {
  email: string;
  code: string;
  expiresAt: number;
  used: boolean;
  createdAt: number;
}
