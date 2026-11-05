import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Campaign, SocialPlatform, SocialPlatformPublication, UserProfile } from '../src/types';
import {
  createSocialMediaService as createSocialMediaServiceImpl,
  SocialMediaDependencies,
  filterOptedInSupporters,
  SocialMediaRepository,
  SocialPublicationResult
} from '../src/server/socialMediaService';
import { hasValidAdminCampaignApproval } from '../src/server/campaignReviewPolicy';

const createSocialMediaService = (
  dependencies: Omit<SocialMediaDependencies, 'isAdminUid'>
) => createSocialMediaServiceImpl({
  ...dependencies,
  isAdminUid: uid => uid === 'admin-uid'
});

const campaign = (status: Campaign['status']): Campaign => ({
  id: 'campaign-1',
  disasterName: 'Flood Relief',
  disasterType: 'Flood',
  province: 'Sindh',
  location: 'Badin',
  description: 'Emergency supplies are needed.',
  photoUrl: 'https://pakrelief.example/campaign.jpg',
  targetBeneficiaries: 100,
  ngoId: 'ngo-1',
  ngoName: 'Relief NGO',
  status,
  createdAt: 1,
  ...(status === 'approved' ? { reviewedByAdminId: 'admin-uid', reviewedAt: 2 } : {})
});

function makeRepository(seedStatus: Campaign['status'], supporters: Array<{ id: string; phone: string }> = []) {
  let currentCampaign = campaign(seedStatus);
  const platformStates = new Map<SocialPlatform, SocialPlatformPublication>();
  const recipientStates = new Map<string, Record<string, any>>();
  const repository: SocialMediaRepository = {
    getCampaign: async () => ({ ...currentCampaign, socialPublishing: Object.fromEntries(platformStates) as unknown as Campaign['socialPublishing'] }),
    claimPlatform: async (campaignId, platform, retry, now, isAdminUid) => {
      if (campaignId !== currentCampaign.id || !hasValidAdminCampaignApproval(currentCampaign, isAdminUid)) return null;
      const current = platformStates.get(platform) || { status: 'pending', attempts: 0, updatedAt: now };
      if (retry) {
        if (current.status !== 'failed' || !current.retryable || (current.retryAfter && current.retryAfter > now)) return null;
      } else if (current.status !== 'pending' || current.attempts > 0) {
        return null;
      }
      const next = { ...current, status: 'publishing' as const, attempts: current.attempts + 1, updatedAt: now };
      platformStates.set(platform, next);
      return { ...currentCampaign, socialPublishing: { ...Object.fromEntries(platformStates), [platform]: next } as unknown as Campaign['socialPublishing'] };
    },
    updatePlatform: async (_campaignId, platform, updates) => {
      platformStates.set(platform, {
        ...(platformStates.get(platform) || { status: 'pending', attempts: 0, updatedAt: 0 }),
        ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))
      } as SocialPlatformPublication);
    },
    getOptedInSupporters: async () => supporters,
    claimWhatsAppRecipient: async (_campaignId, userId, retry, now) => {
      const supporter = supporters.find(candidate => candidate.id === userId);
      if (!supporter) return 'blocked';
      const current = recipientStates.get(userId);
      if (current?.status === 'published') return 'published';
      if (current?.status === 'sending' || current?.status === 'claimed') return 'blocked';
      if (current?.status === 'failed' && (!retry || current.retryable === false || (current.retryAfter && current.retryAfter > now))) return 'blocked';
      recipientStates.set(userId, { status: 'claimed', attempts: Number(current?.attempts || 0) + 1, updatedAt: now });
      return 'claimed';
    },
    authorizeWhatsAppDispatch: async (_campaignId, userId, now) => {
      const supporter = supporters.find(candidate => candidate.id === userId);
      const current = recipientStates.get(userId);
      if (!supporter || userId === 'opted-out-before-dispatch' || current?.status !== 'claimed') {
        if (current?.status === 'claimed') recipientStates.set(userId, { ...current, status: 'cancelled', updatedAt: now });
        return 'blocked';
      }
      recipientStates.set(userId, { ...current, status: 'sending', dispatchAuthorizedAt: now });
      return { status: 'authorized', phone: supporter.phone };
    },
    updateWhatsAppRecipient: async (_campaignId, userId, update) => {
      recipientStates.set(userId, { ...recipientStates.get(userId), ...update });
    }
  };
  return {
    repository,
    getCampaign: () => currentCampaign,
    getPlatform: (platform: SocialPlatform) => platformStates.get(platform),
    getRecipient: (userId: string) => recipientStates.get(userId),
    setCampaign: (updated: Campaign) => { currentCampaign = updated; },
    setPlatform: (platform: SocialPlatform, state: SocialPlatformPublication) => platformStates.set(platform, state)
  };
}

const facebookConfig = {
  accessToken: 'test-token',
  appSecret: 'test-app-secret',
  graphApiVersion: 'v27.0',
  pageId: 'page-1'
};

function response(payload: Record<string, unknown>, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}

test('pending and rejected campaigns cannot be published', async () => {
  for (const status of ['pending_review', 'rejected', 'active'] as const) {
    let fetchCalls = 0;
    const fixture = makeRepository(status);
    const service = createSocialMediaService({
      repository: fixture.repository,
      getConfig: () => facebookConfig,
      fetch: async () => { fetchCalls++; return response({ id: 'unexpected' }); }
    });
    await assert.rejects(service.publishApprovedCampaign('campaign-1'), /Only approved campaigns with valid Admin approval metadata/);
    assert.equal(fetchCalls, 0);
  }
});

test('approved status without an allowlisted Admin approval cannot be published', async () => {
  const fixture = makeRepository('approved');
  fixture.setCampaign({
    ...fixture.getCampaign(),
    reviewedByAdminId: 'unprovisioned-admin'
  });
  let fetchCalls = 0;
  const service = createSocialMediaService({
    repository: fixture.repository,
    getConfig: () => facebookConfig,
    fetch: async () => { fetchCalls++; return response({ id: 'unexpected' }); }
  });
  await assert.rejects(service.publishApprovedCampaign('campaign-1'), /Only approved campaigns with valid Admin approval/);
  assert.equal(fetchCalls, 0);
});

test('missing Meta credentials are recorded as failed, not successful', async () => {
  const fixture = makeRepository('approved');
  let fetchCalls = 0;
  const service = createSocialMediaService({
    repository: fixture.repository,
    getConfig: () => ({}),
    fetch: async () => { fetchCalls++; return response({ id: 'unexpected' }); }
  });
  await service.publishApprovedCampaign('campaign-1');
  const state = fixture.getPlatform('facebook');
  assert.equal(fetchCalls, 0);
  assert.equal(state?.status, 'failed');
  assert.equal(state?.errorCode, 'MISSING_CONFIGURATION');
  assert.match(state?.error || '', /META_ACCESS_TOKEN/);
});

test('failed Meta responses are stored with redacted errors and retry metadata', async () => {
  const fixture = makeRepository('approved');
  fixture.setPlatform('facebook', {
    status: 'failed', attempts: 1, updatedAt: 1, retryable: true
  });
  const service = createSocialMediaService({
    repository: fixture.repository,
    getConfig: () => facebookConfig,
    now: () => 1000,
    fetch: async () => response({ error: { message: 'Rejected recipient +923001234567', code: 190 } }, 429, { 'retry-after': '30' })
  });
  await service.retryPlatform('campaign-1', 'facebook');
  const state = fixture.getPlatform('facebook');
  assert.equal(state?.status, 'failed');
  assert.equal(state?.errorCode, '190');
  assert.equal(state?.retryAfter, 31000);
  assert.equal(state?.retryable, true);
  assert.match(state?.error || '', /\[redacted phone\]/);
  assert.doesNotMatch(state?.error || '', /923001234567/);
});

test('successful Facebook response updates only Facebook publication status', async () => {
  const fixture = makeRepository('approved');
  fixture.setPlatform('facebook', { status: 'failed', attempts: 1, updatedAt: 1, retryable: true });
  const service = createSocialMediaService({
    repository: fixture.repository,
    getConfig: () => facebookConfig,
    fetch: async (input, init) => {
      assert.match(String(input), /\/v27\.0\/page-1\/feed/);
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token');
      return response({ id: 'page-post-123' });
    }
  });
  await service.retryPlatform('campaign-1', 'facebook');
  assert.equal(fixture.getPlatform('facebook')?.status, 'published');
  assert.equal(fixture.getPlatform('facebook')?.publishedId, 'page-post-123');
  assert.equal(fixture.getPlatform('instagram'), undefined);
});

test('successful Instagram publishing creates and publishes a media container', async () => {
  const fixture = makeRepository('approved');
  fixture.setPlatform('instagram', { status: 'failed', attempts: 1, updatedAt: 1, retryable: true });
  const calls: string[] = [];
  const service = createSocialMediaService({
    repository: fixture.repository,
    getConfig: () => ({ ...facebookConfig, instagramAccountId: 'ig-1' }),
    fetch: async input => {
      calls.push(String(input));
      return response(calls.length === 1 ? { id: 'container-1' } : { id: 'ig-media-1' });
    }
  });
  await service.retryPlatform('campaign-1', 'instagram');
  assert.equal(calls.length, 2);
  assert.match(calls[0], /\/ig-1\/media\?/);
  assert.match(calls[1], /\/ig-1\/media_publish\?/);
  assert.equal(fixture.getPlatform('instagram')?.status, 'published');
  assert.equal(fixture.getPlatform('instagram')?.publishedId, 'ig-media-1');
  assert.equal(fixture.getPlatform('instagram')?.containerId, 'container-1');
});

test('WhatsApp recipient filtering excludes opt-outs, non-donors, and invalid phones', () => {
  const users: UserProfile[] = [
    { id: 'in', firebaseUid: 'in', email: 'in@example.test', name: 'In', role: 'donor', emailVerified: true, verificationStatus: 'active', createdAt: 1, whatsappPhone: '03001234567', whatsappOptIn: true },
    { id: 'out', firebaseUid: 'out', email: 'out@example.test', name: 'Out', role: 'donor', emailVerified: true, verificationStatus: 'active', createdAt: 1, whatsappPhone: '+923001234568', whatsappOptIn: true, whatsappOptedOutAt: 2 },
    { id: 'no-consent', firebaseUid: 'no-consent', email: 'no@example.test', name: 'No', role: 'donor', emailVerified: true, verificationStatus: 'active', createdAt: 1, whatsappPhone: '+923001234569' },
    { id: 'ngo', firebaseUid: 'ngo', email: 'ngo@example.test', name: 'NGO', role: 'ngo', emailVerified: true, verificationStatus: 'approved', createdAt: 1, whatsappPhone: '+923001234570', whatsappOptIn: true },
    { id: 'invalid', firebaseUid: 'invalid', email: 'invalid@example.test', name: 'Invalid', role: 'donor', emailVerified: true, verificationStatus: 'active', createdAt: 1, whatsappPhone: '123', whatsappOptIn: true }
  ];
  assert.deepEqual(filterOptedInSupporters(users), [{ id: 'in', phone: '+923001234567' }]);
});

test('WhatsApp send rechecks consent after claim and before dispatch', async () => {
  const fixture = makeRepository('approved', [{ id: 'opted-out-before-dispatch', phone: '+923001234567' }]);
  let fetchCalls = 0;
  const service = createSocialMediaService({
    repository: fixture.repository,
    getConfig: () => ({ ...facebookConfig, whatsappPhoneNumberId: 'wa-phone-1', whatsappBusinessAccountId: 'wa-business-1', whatsappTemplateName: 'approved_campaign_notice', whatsappTemplateLanguage: 'en' }),
    fetch: async input => {
      if (new URL(String(input)).pathname.endsWith('/messages')) fetchCalls++;
      return response({ id: 'facebook-post' });
    }
  });
  await service.publishApprovedCampaign('campaign-1');
  assert.equal(fetchCalls, 0);
  assert.equal(fixture.getRecipient('opted-out-before-dispatch')?.status, 'cancelled');
  assert.equal(fixture.getPlatform('whatsapp')?.status, 'failed');
});

test('WhatsApp requests use approved templates and store only message IDs, not phone numbers', async () => {
  const fixture = makeRepository('approved', [{ id: 'supporter-1', phone: '+923001234567' }]);
  const service = createSocialMediaService({
    repository: fixture.repository,
    getConfig: () => ({ ...facebookConfig, whatsappPhoneNumberId: 'wa-phone-1', whatsappBusinessAccountId: 'wa-business-1', whatsappTemplateName: 'approved_campaign_notice', whatsappTemplateLanguage: 'en' }),
    fetch: async (input, init) => {
      assert.match(String(input), /\/wa-phone-1\/messages\?/);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.type, 'template');
      assert.equal(body.template.name, 'approved_campaign_notice');
      assert.equal(body.to, '+923001234567');
      return response({ messages: [{ id: 'wamid.123' }] });
    }
  });
  await service.publishApprovedCampaign('campaign-1');
  assert.equal(fixture.getPlatform('whatsapp')?.status, 'published');
  assert.equal(fixture.getPlatform('whatsapp')?.acceptedCount, 1);
  assert.equal(fixture.getRecipient('supporter-1')?.messageId, 'wamid.123');
  assert.equal('phone' in (fixture.getRecipient('supporter-1') || {}), false);
});
