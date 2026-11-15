import { NgoProfile, SupplierProfile, UserProfile } from '../types';

// Pure registration logic shared by /auth/register-profile and /auth/recover-profile.
// Every ownership field is derived from the verified Firebase identity, never from the request body.

export type SelfRegistrationRole = 'donor' | 'ngo' | 'supplier';
export type RegistrationMode = 'register' | 'recover';
export type RegistrationRecordKind = 'profile' | 'identifierMapping' | 'emailMapping' | 'entity';

const SELF_REGISTRATION_ROLES: readonly SelfRegistrationRole[] = ['donor', 'ngo', 'supplier'];
const NGO_REGISTRATION_TYPES: readonly NgoProfile['registrationType'][] = ['SECP', 'Society', 'Trust', 'VSWA'];
const SUPPLIER_BUSINESS_TYPES: readonly SupplierProfile['businessType'][] = ['Business', 'Sole Proprietor', 'Distributor'];

export interface VerifiedIdentity {
  uid: string;
  email: string;
}

export interface IdentifierMappingRecord {
  identifier: string;
  email: string;
  role: string;
  userId?: string;
  name?: string;
  verificationStatus?: string;
}

export type RegistrationEntity =
  | { collection: 'ngos'; identifierField: 'registrationNumber'; record: NgoProfile }
  | { collection: 'suppliers'; identifierField: 'cuinOrCnic'; record: SupplierProfile };

export interface RegistrationRecords {
  uid: string;
  email: string;
  role: SelfRegistrationRole;
  identifier: string;
  identifierKey: string;
  emailKey: string;
  profile: UserProfile;
  identifierMapping: IdentifierMappingRecord;
  /** Null when the identifier is the email itself (both mappings would share one document). */
  emailMapping: IdentifierMappingRecord | null;
  entity: RegistrationEntity | null;
}

/** Snapshot of everything the registration could collide with, read inside one transaction. */
export interface RegistrationState {
  userDoc: (Partial<UserProfile> & { id: string }) | null;
  identifierMapping: IdentifierMappingRecord | null;
  emailMapping: IdentifierMappingRecord | null;
  entityDoc: { id: string; linkedUserId?: string; registrationNumber?: string; cuinOrCnic?: string } | null;
  usersWithEmail: Array<{ id: string; firebaseUid?: string }>;
  entitiesWithIdentifier: Array<{ id: string; linkedUserId?: string }>;
}

export interface RegistrationPlan {
  toCreate: RegistrationRecordKind[];
  existing: RegistrationRecordKind[];
}

export type RegistrationConflictCode =
  | 'profile_exists'
  | 'profile_mismatch'
  | 'email_taken'
  | 'identifier_taken'
  | 'entity_conflict'
  | 'registration_number_taken';

export class RegistrationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationValidationError';
  }
}

export class RegistrationConflictError extends Error {
  constructor(public readonly code: RegistrationConflictCode, message: string) {
    super(message);
    this.name = 'RegistrationConflictError';
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Same normalization as firestoreService.getIdentifierMapping/saveIdentifierMapping document IDs. */
export function normalizeIdentifierKey(identifier: string): string {
  return identifier.trim().toLowerCase();
}

/** Masks an email for logs: tualeya@gmail.com -> t*****a@gmail.com */
export function maskEmail(email: string | undefined): string {
  if (!email || !email.includes('@')) return '<none>';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0] || ''}*@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

function text(value: unknown, maxLength = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function requireText(value: unknown, label: string, maxLength = 200): string {
  const result = text(value, maxLength);
  if (!result) throw new RegistrationValidationError(`${label} is required.`);
  return result;
}

function validateIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RegistrationValidationError('Missing mandatory registration fields.');
  }
  const identifier = value.trim();
  // Identifiers become Firestore document IDs; reject values Firestore cannot store safely.
  if (identifier.length > 128 || identifier.includes('/') || identifier === '.' || identifier === '..' || /^__.*__$/.test(identifier)) {
    throw new RegistrationValidationError('The registration identifier format is invalid.');
  }
  return identifier;
}

export interface BuildRegistrationOptions {
  now: number;
  /**
   * Recovery must not invent organization details: when true, every NGO/supplier field
   * that would otherwise get a default value must be supplied explicitly.
   */
  requireCompleteDetails: boolean;
}

export function buildRegistrationRecords(
  body: Record<string, unknown>,
  verified: VerifiedIdentity,
  options: BuildRegistrationOptions
): RegistrationRecords {
  const role = body.role as SelfRegistrationRole;
  if (!role || !body.identifier) {
    throw new RegistrationValidationError('Missing mandatory registration fields.');
  }
  if (!SELF_REGISTRATION_ROLES.includes(role)) {
    throw new RegistrationValidationError('Self-registration is limited to donor, NGO, and supplier accounts.');
  }

  const uid = verified.uid;
  const email = normalizeEmail(verified.email);
  const identifier = validateIdentifier(body.identifier);
  const identifierKey = normalizeIdentifierKey(identifier);
  const emailKey = normalizeIdentifierKey(email);
  const strict = options.requireCompleteDetails;

  const name = role === 'donor' ? (text(body.name) || email) : requireText(body.name, 'Organization name');
  const contact = strict && role !== 'donor' ? requireText(body.contact, 'Contact phone', 40) : text(body.contact, 40);
  const isDonor = role === 'donor';
  const mappingStatus = isDonor ? 'approved' : 'pending';

  const profile: UserProfile = {
    id: uid,
    firebaseUid: uid,
    email,
    name,
    role,
    contact,
    emailVerified: true,
    verificationStatus: isDonor ? 'active' : 'pending',
    createdAt: options.now,
    identifier
  };

  const identifierMapping: IdentifierMappingRecord = {
    identifier,
    email,
    role,
    userId: uid,
    name,
    verificationStatus: mappingStatus
  };

  const emailMapping: IdentifierMappingRecord | null = emailKey === identifierKey ? null : {
    identifier: email,
    email,
    role,
    userId: uid,
    name,
    verificationStatus: mappingStatus
  };

  let entity: RegistrationEntity | null = null;
  if (role === 'ngo') {
    const rawType = text(body.registrationType, 20);
    if (rawType && !NGO_REGISTRATION_TYPES.includes(rawType as NgoProfile['registrationType'])) {
      throw new RegistrationValidationError('Registration type must be one of SECP, Society, Trust, or VSWA.');
    }
    if (strict && !rawType) throw new RegistrationValidationError('Registration type is required.');
    entity = {
      collection: 'ngos',
      identifierField: 'registrationNumber',
      record: {
        id: uid,
        linkedUserId: uid,
        organizationName: name,
        registrationType: (rawType || 'SECP') as NgoProfile['registrationType'],
        registrationNumber: identifier,
        focalPerson: strict ? requireText(body.focalPerson, 'Focal person') : (text(body.focalPerson) || name),
        phone: contact,
        address: strict ? requireText(body.address, 'Address', 500) : text(body.address, 500),
        email,
        status: 'pending',
        createdAt: options.now
      }
    };
  } else if (role === 'supplier') {
    const rawType = text(body.businessType, 30);
    if (rawType && !SUPPLIER_BUSINESS_TYPES.includes(rawType as SupplierProfile['businessType'])) {
      throw new RegistrationValidationError('Business type must be Business, Sole Proprietor, or Distributor.');
    }
    if (strict && !rawType) throw new RegistrationValidationError('Business type is required.');
    entity = {
      collection: 'suppliers',
      identifierField: 'cuinOrCnic',
      record: {
        id: uid,
        linkedUserId: uid,
        companyName: name,
        businessType: (rawType || 'Distributor') as SupplierProfile['businessType'],
        cuinOrCnic: identifier,
        warehouseCity: strict ? requireText(body.warehouseCity, 'Warehouse city') : (text(body.warehouseCity) || 'Karachi'),
        phone: contact,
        email,
        status: 'pending',
        createdAt: options.now
      }
    };
  }

  return { uid, email, role, identifier, identifierKey, emailKey, profile, identifierMapping, emailMapping, entity };
}

function mappingOwnedBy(mapping: IdentifierMappingRecord, records: RegistrationRecords): boolean {
  return mapping.userId === records.uid &&
    normalizeEmail(mapping.email || '') === records.email &&
    mapping.role === records.role;
}

/**
 * Decides which records to create. Throws RegistrationConflictError when any existing record
 * belongs to a different user or disagrees with the verified identity; existing records are never overwritten.
 */
export function planRegistration(
  state: RegistrationState,
  records: RegistrationRecords,
  mode: RegistrationMode
): RegistrationPlan {
  const toCreate: RegistrationRecordKind[] = [];
  const existing: RegistrationRecordKind[] = [];

  if (state.userDoc) {
    if (mode === 'register') {
      throw new RegistrationConflictError('profile_exists', 'A profile already exists for this Firebase account.');
    }
    const owner = state.userDoc.firebaseUid || state.userDoc.id;
    const consistent = owner === records.uid &&
      state.userDoc.id === records.uid &&
      normalizeEmail(state.userDoc.email || '') === records.email &&
      state.userDoc.role === records.role &&
      normalizeIdentifierKey(state.userDoc.identifier || '') === records.identifierKey;
    if (!consistent) {
      throw new RegistrationConflictError('profile_mismatch', 'The existing profile for this account does not match the recovery details. Contact NDMA support.');
    }
    existing.push('profile');
  } else {
    toCreate.push('profile');
  }

  if (state.usersWithEmail.some(user => user.id !== records.uid || (user.firebaseUid && user.firebaseUid !== records.uid))) {
    throw new RegistrationConflictError('email_taken', 'This email is already linked to another PakRelief profile. Contact support.');
  }

  if (state.identifierMapping) {
    if (!mappingOwnedBy(state.identifierMapping, records)) {
      throw new RegistrationConflictError('identifier_taken', 'This identifier is already registered to another account. Contact support if this is your organization.');
    }
    existing.push('identifierMapping');
  } else {
    toCreate.push('identifierMapping');
  }

  if (records.emailMapping) {
    if (state.emailMapping) {
      if (!mappingOwnedBy(state.emailMapping, records)) {
        throw new RegistrationConflictError('email_taken', 'This email is already registered to another account. Contact support.');
      }
      existing.push('emailMapping');
    } else {
      toCreate.push('emailMapping');
    }
  }

  if (records.entity) {
    const identifierField = records.entity.identifierField;
    if (state.entityDoc) {
      const consistent = state.entityDoc.id === records.uid &&
        state.entityDoc.linkedUserId === records.uid &&
        normalizeIdentifierKey(state.entityDoc[identifierField] || '') === records.identifierKey;
      if (!consistent) {
        throw new RegistrationConflictError('entity_conflict', 'An organization record already exists for this account with different details. Contact support.');
      }
      existing.push('entity');
    } else {
      toCreate.push('entity');
    }
    if (state.entitiesWithIdentifier.some(entity => entity.id !== records.uid || entity.linkedUserId !== records.uid)) {
      throw new RegistrationConflictError('registration_number_taken', 'This registration number is already used by another organization. Contact support.');
    }
  }

  return { toCreate, existing };
}

/** Repository boundary: reads state and, when commit is true, creates the planned records atomically. */
export type RunRegistration = (
  records: RegistrationRecords,
  mode: RegistrationMode,
  commit: boolean
) => Promise<RegistrationPlan>;
