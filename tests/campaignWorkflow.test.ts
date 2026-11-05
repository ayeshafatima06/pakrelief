import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Campaign, SocialPlatform, UserProfile, UserRole } from '../src/types';
import { createAuthMiddleware } from '../src/server/authMiddleware';
import { verifyTokenWithRevocationCheck } from '../src/server/adminAuthService';
import { getStalePublicationFailure } from '../src/server/socialMediaService';
import { createCampaignWorkflowRouter } from '../src/server/campaignWorkflow';
import { assertCampaignReviewable, hasValidAdminCampaignApproval } from '../src/server/campaignReviewPolicy';

const profile = (id: string, role: UserRole): UserProfile => ({
  id,
  firebaseUid: id,
  email: `${id}@example.test`,
  name: `${role} ${id}`,
  role,
  emailVerified: true,
  verificationStatus: role === 'ngo' ? 'approved' : 'active',
  createdAt: 1
});

const campaign = (id: string, status: Campaign['status'], ngoId = 'ngo-uid'): Campaign => ({
  id,
  disasterName: id,
  disasterType: 'Flood',
  province: 'Sindh',
  location: 'Test location',
  description: 'Test campaign',
  photoUrl: '',
  targetBeneficiaries: 10,
  ngoId,
  ngoName: 'Test NGO',
  status,
  createdAt: 1,
  ...(status === 'approved' ? { reviewedByAdminId: 'admin-uid', reviewedAt: 2 } : {})
});

async function withWorkflow(
  campaignsSeed: Campaign[],
  action: (baseUrl: string, publishCalls: Map<string, number>, retryCalls: Map<string, number>) => Promise<void>
): Promise<void> {
  const profiles = new Map<string, UserProfile>([
    ['donor-uid', profile('donor-uid', 'donor')],
    ['ngo-uid', profile('ngo-uid', 'ngo')],
    ['admin-uid', profile('admin-uid', 'admin')],
    ['admin-own-campaign', profile('admin-own-campaign', 'admin')],
    ['unprovisioned-admin', profile('unprovisioned-admin', 'admin')]
  ]);
  const campaigns = new Map(campaignsSeed.map(item => [item.id, item]));
  const publishCalls = new Map<string, number>();
  const retryCalls = new Map<string, number>();
  const auth = createAuthMiddleware({
    verifyToken: async token => profiles.has(token)
      ? { uid: token, email: `${token}@example.test` }
      : null,
    getUserById: async uid => profiles.get(uid) || null,
    isAdminUid: uid => uid === 'admin-uid' || uid === 'admin-own-campaign'
  });
  const app = express();
  app.use(express.json());
  app.use(createCampaignWorkflowRouter({
    requireAuth: auth.requireAuth,
    requireAdmin: auth.requireAdmin,
    getCampaigns: async () => [...campaigns.values()],
    getCampaign: async campaignId => campaigns.get(campaignId) || null,
    hasValidApproval: item => hasValidAdminCampaignApproval(
      item,
      uid => uid === 'admin-uid' || uid === 'admin-own-campaign'
    ),
    getRequirements: async () => [],
    publishApprovedCampaign: async campaignId => {
      publishCalls.set(campaignId, (publishCalls.get(campaignId) || 0) + 1);
    },
    retryPlatform: async campaignId => {
      const current = campaigns.get(campaignId);
      const publication = current?.socialPublishing?.facebook;
      if (publication && (publication.status !== 'failed' || !publication.retryable)) {
        throw new Error('Platform state is not safely retryable.');
      }
      retryCalls.set(campaignId, (retryCalls.get(campaignId) || 0) + 1);
    },
    reconcileStalePublication: async (campaignId, platform: SocialPlatform, now) => {
      const current = campaigns.get(campaignId);
      if (!current) return false;
      const publication = current.socialPublishing?.[platform];
      const failure = getStalePublicationFailure(publication, now);
      if (!failure || !publication) return false;
      campaigns.set(campaignId, {
        ...current,
        socialPublishing: {
          ...current.socialPublishing,
          [platform]: { ...publication, ...failure }
        } as Campaign['socialPublishing']
      });
      return true;
    },
    reviewCampaign: async input => {
      const current = campaigns.get(input.campaignId);
      if (!current) return null;
      assertCampaignReviewable(current, input.adminUid, input.adminProfileId);
      const updated: Campaign = {
        ...current,
        status: input.status,
        reviewedByAdminId: input.adminUid,
        reviewedByAdminName: input.adminName,
        reviewedAt: input.reviewedAt,
        reviewNotes: input.reviewNotes
      };
      campaigns.set(input.campaignId, updated);
      return updated;
    }
  }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try {
    await action(`http://127.0.0.1:${address.port}`, publishCalls, retryCalls);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function review(baseUrl: string, token?: string, campaignId = 'pending') {
  return fetch(`${baseUrl}/admin/review-campaign`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ campaignId, status: 'approved' })
  });
}

async function retryFacebook(baseUrl: string, token?: string, campaignId = 'approved') {
  return fetch(`${baseUrl}/admin/campaigns/${campaignId}/social-publications/facebook/retry`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
}

test('unauthenticated campaign approval is denied', async () => {
  await withWorkflow([campaign('pending', 'pending_review')], async baseUrl => {
    const response = await review(baseUrl);
    assert.equal(response.status, 401);
  });
});

test('donor campaign approval is denied', async () => {
  await withWorkflow([campaign('pending', 'pending_review')], async baseUrl => {
    const response = await review(baseUrl, 'donor-uid');
    assert.equal(response.status, 403);
  });
});

test('NGO campaign approval is denied', async () => {
  await withWorkflow([campaign('pending', 'pending_review')], async baseUrl => {
    const response = await review(baseUrl, 'ngo-uid');
    assert.equal(response.status, 403);
  });
});

test('admin approval succeeds and records trusted approver metadata', async () => {
  await withWorkflow([campaign('pending', 'pending_review')], async baseUrl => {
    const response = await review(baseUrl, 'admin-uid');
    const result = await response.json() as { success: boolean; campaign: Campaign };
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(result.campaign.status, 'approved');
    assert.equal(result.campaign.reviewedByAdminId, 'admin-uid');
    assert.equal(typeof result.campaign.reviewedAt, 'number');
  });
});

test('campaign owner cannot review their own campaign', async () => {
  await withWorkflow([campaign('pending', 'pending_review', 'admin-own-campaign')], async baseUrl => {
    const response = await review(baseUrl, 'admin-own-campaign');
    assert.equal(response.status, 403);
  });
});

test('pending and rejected campaigns are hidden while approved campaigns are public', async () => {
  await withWorkflow([
    campaign('pending', 'pending_review'),
    campaign('rejected', 'rejected'),
    campaign('approved', 'approved'),
    campaign('active', 'active')
  ], async baseUrl => {
    const response = await fetch(`${baseUrl}/campaigns`);
    const result = await response.json() as { campaigns: Campaign[] };
    assert.equal(response.status, 200);
    assert.deepEqual(result.campaigns.map(item => item.id).sort(), ['active', 'approved']);
  });
});

test('admin cannot duplicate or conflict with a completed review', async () => {
  await withWorkflow([campaign('pending', 'approved')], async baseUrl => {
    const response = await review(baseUrl, 'admin-uid');
    assert.equal(response.status, 409);
  });
});

test('admin profile without operator provisioning is denied', async () => {
  await withWorkflow([campaign('pending', 'pending_review')], async baseUrl => {
    const response = await review(baseUrl, 'unprovisioned-admin');
    assert.equal(response.status, 403);
  });
});

test('duplicate approval requests do not start publishing twice', async () => {
  await withWorkflow([campaign('pending', 'pending_review')], async (baseUrl, publishCalls) => {
    const first = await review(baseUrl, 'admin-uid');
    const duplicate = await review(baseUrl, 'admin-uid');
    assert.equal(first.status, 200);
    assert.equal(duplicate.status, 409);
    assert.equal(publishCalls.get('pending'), 1);
  });
});

test('only an authorized admin can retry a platform publication', async () => {
  const retryableCampaign = {
    ...campaign('approved', 'approved'),
    socialPublishing: {
      facebook: { status: 'failed' as const, attempts: 1, updatedAt: 1, retryable: true }
    } as Campaign['socialPublishing']
  };
  await withWorkflow([retryableCampaign], async (baseUrl, _publishCalls, retryCalls) => {
    const donorResponse = await retryFacebook(baseUrl, 'donor-uid');
    const adminResponse = await retryFacebook(baseUrl, 'admin-uid');
    assert.equal(donorResponse.status, 403);
    assert.equal(adminResponse.status, 200);
    assert.equal(retryCalls.get('approved'), 1);
  });
});

test('active campaigns cannot be retried for social publishing', async () => {
  await withWorkflow([campaign('active', 'active')], async (baseUrl, _publishCalls, retryCalls) => {
    const response = await retryFacebook(baseUrl, 'admin-uid', 'active');
    assert.equal(response.status, 409);
    assert.equal(retryCalls.get('active'), undefined);
  });
});

test('stale publishing is marked unknown and never automatically retried', async () => {
  const staleCampaign = {
    ...campaign('stale', 'approved'),
    socialPublishing: {
      facebook: { status: 'publishing' as const, attempts: 1, updatedAt: 1, retryable: false }
    } as Campaign['socialPublishing']
  };
  await withWorkflow([staleCampaign], async (baseUrl, _publishCalls, retryCalls) => {
    const response = await fetch(`${baseUrl}/admin/social-publications`, {
      headers: { Authorization: 'Bearer admin-uid' }
    });
    const result = await response.json() as { campaigns: Array<{ socialPublishing: Campaign['socialPublishing'] }> };
    assert.equal(result.campaigns[0].socialPublishing?.facebook?.status, 'failed');
    assert.equal(result.campaigns[0].socialPublishing?.facebook?.errorCode, 'OUTCOME_UNKNOWN');
    assert.equal(result.campaigns[0].socialPublishing?.facebook?.retryable, false);

    const retry = await retryFacebook(baseUrl, 'admin-uid', 'stale');
    assert.equal(retry.status, 409);
    assert.equal(retryCalls.get('stale'), undefined);
  });
});

test('Firebase token verifier requests revocation checking and rejects revoked or expired tokens', async () => {
  let checkRevokedRequested = false;
  const verified = await verifyTokenWithRevocationCheck('valid-token', async (token, checkRevoked) => {
    assert.equal(token, 'valid-token');
    checkRevokedRequested = checkRevoked;
    return { uid: 'verified-uid', email: 'verified@example.test' };
  });
  assert.equal(checkRevokedRequested, true);
  assert.equal(verified?.uid, 'verified-uid');

  for (const code of ['auth/id-token-revoked', 'auth/id-token-expired']) {
    const result = await verifyTokenWithRevocationCheck('invalid-token', async () => {
      throw Object.assign(new Error(code), { code });
    });
    assert.equal(result, null);
  }
});