import express, { RequestHandler, Response } from 'express';
import { Campaign, Requirement, SocialPlatform } from '../types';
import type { AuthenticatedRequest } from './authMiddleware';
import {
  CampaignReviewConflictError,
  CampaignSelfReviewError,
  hasValidAdminCampaignApproval
} from './campaignReviewPolicy';

interface CampaignWorkflowDependencies {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  getCampaigns: () => Promise<Campaign[]>;
  getRequirements: () => Promise<Requirement[]>;
  publishApprovedCampaign: (campaignId: string) => Promise<void>;
  retryPlatform: (campaignId: string, platform: SocialPlatform) => Promise<void>;
  getCampaign: (campaignId: string) => Promise<Campaign | null>;
  hasValidApproval: (campaign: Campaign) => boolean;
  reconcileStalePublication: (campaignId: string, platform: SocialPlatform, now: number) => Promise<boolean>;
  reviewCampaign: (input: {
    campaignId: string;
    status: 'approved' | 'rejected';
    adminUid: string;
    adminProfileId: string;
    adminName: string;
    reviewNotes: string;
    reviewedAt: number;
  }) => Promise<Campaign | null>;
}

export function isPublicCampaign(campaign: Campaign): boolean {
  return campaign.status === 'approved' || campaign.status === 'active';
}

export function createCampaignWorkflowRouter(dependencies: CampaignWorkflowDependencies) {
  const router = express.Router();

  router.get('/campaigns', async (_req, res: Response) => {
    try {
      const [campaigns, requirements] = await Promise.all([
        dependencies.getCampaigns(),
        dependencies.getRequirements()
      ]);
      const visibleCampaigns = campaigns.filter(isPublicCampaign);
      const populated = visibleCampaigns.map(campaign => ({
        ...(({ socialPublishing: _socialPublishing, ...publicCampaign }) => publicCampaign)(campaign),
        requirements: requirements.filter(requirement => requirement.campaignId === campaign.id)
      }));
      res.json({ success: true, campaigns: populated });
    } catch {
      res.status(500).json({ success: false, error: 'Could not load public campaigns.' });
    }
  });

  router.get('/admin/pending-campaigns', dependencies.requireAuth, dependencies.requireAdmin, async (_req, res: Response) => {
    try {
      const campaigns = await dependencies.getCampaigns();
      res.json({ success: true, pendingCampaigns: campaigns.filter(campaign => campaign.status === 'pending_review') });
    } catch {
      res.status(500).json({ success: false, error: 'Could not load pending campaigns.' });
    }
  });

  router.patch('/admin/review-campaign', dependencies.requireAuth, dependencies.requireAdmin, async (req, res: Response) => {
    const { campaignId, status, notes } = req.body;
    if (typeof campaignId !== 'string' || !campaignId.trim()) {
      res.status(400).json({ success: false, error: 'Campaign ID is required.' });
      return;
    }
    if (status !== 'approved' && status !== 'rejected') {
      res.status(400).json({ success: false, error: 'Campaign status must be either approved or rejected.' });
      return;
    }

    const authenticatedRequest = req as AuthenticatedRequest;
    const adminUid = authenticatedRequest.user?.uid;
    const adminProfile = authenticatedRequest.profile;
    if (!adminUid || !adminProfile) {
      res.status(401).json({ success: false, error: 'Authenticated administrator profile is required.' });
      return;
    }

    try {
      const campaign = await dependencies.reviewCampaign({
        campaignId: campaignId.trim(),
        status,
        adminUid,
        adminProfileId: adminProfile.id,
        adminName: adminProfile.name,
        reviewNotes: typeof notes === 'string'
          ? notes.trim().slice(0, 1000)
          : status === 'approved'
            ? 'Campaign approved by NDMA administrator.'
            : 'Campaign rejected by NDMA administrator.',
        reviewedAt: Date.now()
      });
      if (!campaign) {
        res.status(404).json({ success: false, error: 'Campaign not found.' });
        return;
      }
      if (status === 'approved') {
        try {
          await dependencies.publishApprovedCampaign(campaign.id);
        } catch {
          console.error('[PakRelief] Social publishing could not be started after approval.');
        }
      }
      res.json({ success: true, campaign });
    } catch (error) {
      if (error instanceof CampaignSelfReviewError) {
        res.status(403).json({ success: false, error: error.message });
        return;
      }
      if (error instanceof CampaignReviewConflictError) {
        res.status(409).json({ success: false, error: error.message });
        return;
      }
      console.error('[PakRelief] Campaign review failed:', error);
      res.status(500).json({ success: false, error: 'Campaign review could not be completed.' });
    }
  });

  router.get('/admin/social-publications', dependencies.requireAuth, dependencies.requireAdmin, async (_req, res: Response) => {
    try {
      const currentCampaigns = (await dependencies.getCampaigns()).filter(dependencies.hasValidApproval);
      await Promise.all(currentCampaigns.flatMap(campaign =>
        (['facebook', 'instagram', 'whatsapp'] as SocialPlatform[])
          .map(platform => dependencies.reconcileStalePublication(campaign.id, platform, Date.now()))
      ));
      const campaigns = (await dependencies.getCampaigns())
        .filter(dependencies.hasValidApproval)
        .map(campaign => ({
          campaignId: campaign.id,
          title: campaign.disasterName,
          approvalStatus: campaign.status,
          socialPublishing: campaign.socialPublishing || null
        }));
      res.json({ success: true, campaigns });
    } catch {
      res.status(500).json({ success: false, error: 'Could not load social publication statuses.' });
    }
  });

  router.post('/admin/campaigns/:campaignId/social-publications/:platform/retry', dependencies.requireAuth, dependencies.requireAdmin, async (req, res: Response) => {
    const { campaignId, platform } = req.params;
    if (!['facebook', 'instagram', 'whatsapp'].includes(platform)) {
      res.status(400).json({ success: false, error: 'Unsupported social publishing platform.' });
      return;
    }
    try {
      const campaign = await dependencies.getCampaign(campaignId);
      if (!campaign || !dependencies.hasValidApproval(campaign)) {
        res.status(409).json({ success: false, error: 'Only approved campaigns can be retried.' });
        return;
      }
      await dependencies.retryPlatform(campaignId, platform as SocialPlatform);
      const updatedCampaign = await dependencies.getCampaign(campaignId);
      res.json({
        success: true,
        socialPublishing: updatedCampaign?.socialPublishing || null
      });
    } catch {
      res.status(409).json({ success: false, error: 'Publishing could not be retried. Check the stored platform status.' });
    }
  });

  return router;
}