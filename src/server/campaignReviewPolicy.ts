import { Campaign } from '../types';

export class CampaignReviewConflictError extends Error {
  constructor(readonly currentStatus: Campaign['status']) {
    super(`Campaign cannot be reviewed from status '${currentStatus}'.`);
  }
}

export class CampaignSelfReviewError extends Error {
  constructor() {
    super('An administrator cannot review their own campaign.');
  }
}

export function assertCampaignReviewable(
  campaign: Campaign,
  adminUid: string,
  adminProfileId: string
): void {
  if (campaign.ngoId === adminUid || campaign.ngoId === adminProfileId) {
    throw new CampaignSelfReviewError();
  }
  if (campaign.status !== 'pending_review') {
    throw new CampaignReviewConflictError(campaign.status);
  }
}

export function hasValidAdminCampaignApproval(
  campaign: Campaign,
  isAdminUid: (uid: string) => boolean
): boolean {
  const approverUid = campaign.reviewedByAdminId;
  return campaign.status === 'approved' &&
    typeof approverUid === 'string' &&
    approverUid.length > 0 &&
    Number.isFinite(campaign.reviewedAt) &&
    (campaign.reviewedAt || 0) > 0 &&
    isAdminUid(approverUid);
}