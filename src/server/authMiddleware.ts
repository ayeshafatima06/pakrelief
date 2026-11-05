import { NextFunction, Request, RequestHandler, Response } from 'express';
import { UserProfile } from '../types';
import { VerifiedTokenUser } from './adminAuthService';

export interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    uid?: string;
    email?: string;
    role?: string;
    name?: string;
  };
  profile?: UserProfile;
}

interface AuthMiddlewareDependencies {
  verifyToken: (token: string) => Promise<VerifiedTokenUser | null>;
  getUserById: (uid: string) => Promise<UserProfile | null>;
  isAdminUid: (uid: string) => boolean;
}

export function createAuthMiddleware(dependencies: AuthMiddlewareDependencies) {
  const verifyRequest = async (req: Request): Promise<VerifiedTokenUser | null> => {
    const authorization = req.headers.authorization;
    if (!authorization) return null;

    const [scheme, token, ...extra] = authorization.trim().split(/\s+/);
    if (scheme !== 'Bearer' || !token || extra.length > 0) return null;
    return dependencies.verifyToken(token);
  };

  const requireFirebaseIdentity: RequestHandler = async (req, res, next: NextFunction) => {
    try {
      const verified = await verifyRequest(req);
      if (!verified) {
        res.status(401).json({ success: false, error: 'A valid Firebase authentication token is required.' });
        return;
      }

      (req as AuthenticatedRequest).user = {
        uid: verified.uid,
        email: verified.email,
        name: verified.name
      };
      next();
    } catch {
      res.status(401).json({ success: false, error: 'Invalid or expired Firebase authentication token.' });
    }
  };

  const requireAuth: RequestHandler = async (req, res, next: NextFunction) => {
    try {
      const verified = await verifyRequest(req);
      if (!verified) {
        res.status(401).json({ success: false, error: 'A valid Firebase authentication token is required.' });
        return;
      }

      const profile = await dependencies.getUserById(verified.uid);
      if (!profile || (profile.firebaseUid && profile.firebaseUid !== verified.uid)) {
        res.status(403).json({ success: false, error: 'User profile not found for authenticated token.' });
        return;
      }

      const authenticatedRequest = req as AuthenticatedRequest;
      authenticatedRequest.profile = profile;
      authenticatedRequest.user = {
        id: profile.id,
        uid: verified.uid,
        email: profile.email,
        role: profile.role,
        name: profile.name
      };
      next();
    } catch {
      res.status(401).json({ success: false, error: 'Invalid or expired Firebase authentication token.' });
    }
  };

  const requireRole = (role: UserProfile['role']): RequestHandler => (req, res, next) => {
    if ((req as AuthenticatedRequest).profile?.role !== role) {
      res.status(403).json({ success: false, error: `${role} authorization required.` });
      return;
    }
    next();
  };

  const requireAdmin: RequestHandler = (req, res, next) => {
    const authenticatedRequest = req as AuthenticatedRequest;
    const uid = authenticatedRequest.user?.uid;
    if (authenticatedRequest.profile?.role !== 'admin' || !uid || !dependencies.isAdminUid(uid)) {
      res.status(403).json({ success: false, error: 'Administrator access is not provisioned for this Firebase account.' });
      return;
    }
    next();
  };

  return {
    requireFirebaseIdentity,
    requireAuth,
    requireAdmin,
    requireDonor: requireRole('donor'),
    requireNgo: requireRole('ngo'),
    requireSupplier: requireRole('supplier')
  };
}