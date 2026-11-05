import { createHmac } from 'node:crypto';
import {
  Campaign,
  SocialPlatform,
  SocialPlatformPublication,
  UserProfile
} from '../types';
import { hasValidAdminCampaignApproval } from './campaignReviewPolicy';

export interface SocialMediaConfig {
  accessToken?: string;
  appSecret?: string;
  graphApiVersion?: string;
  pageId?: string;
  instagramAccountId?: string;
  whatsappPhoneNumberId?: string;
  whatsappBusinessAccountId?: string;
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string;
  publicCampaignUrl?: string;
}

export interface OptedInSupporter {
  id: string;
  phone: string;
}

export function normalizeWhatsAppPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (/^03\d{9}$/.test(digits)) return `+92${digits.slice(1)}`;
  if (/^923\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\d{10,15}$/.test(digits) && !digits.startsWith('0')) return `+${digits}`;
  return null;
}

export function filterOptedInSupporters(profiles: UserProfile[]): OptedInSupporter[] {
  return profiles.flatMap(profile => {
    if (profile.role !== 'donor' || profile.whatsappOptIn !== true || profile.whatsappOptedOutAt || !profile.whatsappPhone) return [];
    const phone = normalizeWhatsAppPhone(profile.whatsappPhone);
    return phone ? [{ id: profile.id, phone }] : [];
  });
}

export interface SocialPublicationResult {
  publishedId?: string;
  containerId?: string;
  acceptedCount?: number;
  failedCount?: number;
  error?: string;
  errorCode?: string;
  retryAfter?: number;
  retryable?: boolean;
}

export const SOCIAL_PUBLICATION_STALE_AFTER_MS = 30 * 60 * 1000;

export function getStalePublicationFailure(
  publication: SocialPlatformPublication | undefined,
  now: number
): Partial<SocialPlatformPublication> | null {
  if (
    !publication ||
    publication.status !== 'publishing' ||
    !Number.isFinite(publication.updatedAt) ||
    now - publication.updatedAt < SOCIAL_PUBLICATION_STALE_AFTER_MS
  ) return null;

  return {
    status: 'failed',
    error: 'The previous request outcome is unknown. Verify the platform before any manual retry.',
    errorCode: 'OUTCOME_UNKNOWN',
    retryable: false,
    updatedAt: now
  };
}

export interface SocialMediaRepository {
  getCampaign: (campaignId: string) => Promise<Campaign | null>;
  claimPlatform: (campaignId: string, platform: SocialPlatform, retry: boolean, now: number, isAdminUid: (uid: string) => boolean) => Promise<Campaign | null>;
  updatePlatform: (campaignId: string, platform: SocialPlatform, updates: Partial<SocialPlatformPublication>) => Promise<void>;
  getOptedInSupporters: () => Promise<OptedInSupporter[]>;
  claimWhatsAppRecipient: (campaignId: string, userId: string, retry: boolean, now: number) => Promise<'published' | 'blocked' | 'claimed'>;
  authorizeWhatsAppDispatch: (campaignId: string, userId: string, now: number) => Promise<'blocked' | { status: 'authorized'; phone: string }>;
  updateWhatsAppRecipient: (campaignId: string, userId: string, update: {
    status: 'sending' | 'published' | 'failed';
    updatedAt: number;
    messageId?: string;
    error?: string;
    errorCode?: string;
    retryable?: boolean;
    retryAfter?: number;
  }) => Promise<void>;
}

export interface SocialMediaDependencies {
  repository: SocialMediaRepository;
  isAdminUid: (uid: string) => boolean;
  getConfig?: () => SocialMediaConfig;
  fetch?: typeof fetch;
  now?: () => number;
}

export class SocialMediaConfigurationError extends Error {
  constructor(readonly platform: SocialPlatform, readonly missing: string[]) {
    super(`Social publishing is not configured for ${platform}. Missing: ${missing.join(', ')}.`);
  }
}

export class CampaignNotApprovedError extends Error {
  constructor() {
    super('Only approved campaigns with valid Admin approval metadata can be published.');
  }
}

export class SocialPublicationBusyError extends Error {
  constructor() {
    super('A publication attempt is already running or has already completed.');
  }
}

class MetaApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly retryAfter?: number,
    readonly retryable = true
  ) {
    super(message);
  }
}

const platformConfigKeys: Record<SocialPlatform, Array<keyof SocialMediaConfig>> = {
  facebook: ['accessToken', 'appSecret', 'graphApiVersion', 'pageId'],
  instagram: ['accessToken', 'appSecret', 'graphApiVersion', 'instagramAccountId'],
  whatsapp: [
    'accessToken', 'appSecret', 'graphApiVersion', 'whatsappPhoneNumberId',
    'whatsappBusinessAccountId', 'whatsappTemplateName', 'whatsappTemplateLanguage'
  ]
};

function readEnvironmentConfig(): SocialMediaConfig {
  return {
    accessToken: process.env.META_ACCESS_TOKEN,
    appSecret: process.env.META_APP_SECRET,
    graphApiVersion: process.env.META_GRAPH_API_VERSION,
    pageId: process.env.META_PAGE_ID,
    instagramAccountId: process.env.META_INSTAGRAM_ACCOUNT_ID,
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    whatsappTemplateName: process.env.WHATSAPP_CAMPAIGN_TEMPLATE_NAME,
    whatsappTemplateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE,
    publicCampaignUrl: process.env.PAKRELIEF_PUBLIC_CAMPAIGN_URL
  };
}

function requiredConfig(config: SocialMediaConfig, platform: SocialPlatform): asserts config is SocialMediaConfig & Required<Pick<SocialMediaConfig, 'accessToken' | 'appSecret' | 'graphApiVersion'>> {
  const missing: string[] = platformConfigKeys[platform]
    .filter(key => !config[key])
    .map(key => key === 'accessToken' ? 'META_ACCESS_TOKEN'
      : key === 'appSecret' ? 'META_APP_SECRET'
        : key === 'graphApiVersion' ? 'META_GRAPH_API_VERSION'
          : key === 'pageId' ? 'META_PAGE_ID'
            : key === 'instagramAccountId' ? 'META_INSTAGRAM_ACCOUNT_ID'
              : key === 'whatsappPhoneNumberId' ? 'WHATSAPP_PHONE_NUMBER_ID'
                : key === 'whatsappBusinessAccountId' ? 'WHATSAPP_BUSINESS_ACCOUNT_ID'
                  : key === 'whatsappTemplateName' ? 'WHATSAPP_CAMPAIGN_TEMPLATE_NAME'
                    : 'WHATSAPP_TEMPLATE_LANGUAGE');
  if (config.graphApiVersion && !/^v\d+\.\d+$/.test(config.graphApiVersion)) {
    missing.push('META_GRAPH_API_VERSION (expected vN.N)');
  }
  if (missing.length) throw new SocialMediaConfigurationError(platform, missing);
}

function appSecretProof(config: SocialMediaConfig): string {
  return createHmac('sha256', config.appSecret!).update(config.accessToken!).digest('hex');
}

function cleanMetaMessage(value: unknown): string {
  const message = typeof value === 'string' ? value : 'Meta API request failed.';
  return message
    .replace(/EA[A-Za-z0-9]{12,}/g, '[redacted token]')
    .replace(/\+?\d[\d ()-]{8,}\d/g, '[redacted phone]')
    .slice(0, 500);
}

function retryAfterTimestamp(response: Response, now: number): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return now + Math.max(0, seconds) * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? date : undefined;
}

async function postMeta(
  fetcher: typeof fetch,
  config: SocialMediaConfig,
  path: string,
  body: Record<string, unknown>,
  formEncoded = false,
  now = Date.now()
): Promise<Record<string, any>> {
  const url = new URL(`https://graph.facebook.com/${config.graphApiVersion}/${path}`);
  url.searchParams.set('appsecret_proof', appSecretProof(config));
  const response = await fetcher(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': formEncoded ? 'application/x-www-form-urlencoded' : 'application/json'
    },
    body: formEncoded ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])) : JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });

  let payload: Record<string, any> = {};
  try {
    payload = await response.json() as Record<string, any>;
  } catch {
    payload = {};
  }
  if (!response.ok || payload.error) {
    const status = response.status;
    const retryable = status >= 400 && status < 500;
    throw new MetaApiError(
      cleanMetaMessage(payload.error?.message),
      payload.error?.code ? String(payload.error.code) : String(status || 'META_ERROR'),
      retryAfterTimestamp(response, now),
      retryable
    );
  }
  return payload;
}

function campaignCaption(campaign: Campaign, config: SocialMediaConfig): string {
  const link = config.publicCampaignUrl
    ? `${config.publicCampaignUrl.replace(/\/$/, '')}/${encodeURIComponent(campaign.id)}`
    : '';
  return [
    campaign.disasterName,
    `${campaign.disasterType} relief in ${campaign.location}, ${campaign.province}.`,
    campaign.description,
    link
  ].filter(Boolean).join('\n\n').slice(0, 2200);
}

function validateApproved(campaign: Campaign | null, isAdminUid: (uid: string) => boolean): asserts campaign is Campaign {
  if (!campaign || !hasValidAdminCampaignApproval(campaign, isAdminUid)) {
    throw new CampaignNotApprovedError();
  }
}

function platformState(campaign: Campaign, platform: SocialPlatform): SocialPlatformPublication | undefined {
  return campaign.socialPublishing?.[platform];
}

export function createSocialMediaService(dependencies: SocialMediaDependencies) {
  const getConfig = dependencies.getConfig || readEnvironmentConfig;
  const fetcher = dependencies.fetch || fetch;
  const now = dependencies.now || Date.now;

  const publishFacebook = async (campaign: Campaign, config: SocialMediaConfig): Promise<SocialPublicationResult> => {
    requiredConfig(config, 'facebook');
    const response = await postMeta(fetcher, config, `${config.pageId}/feed`, {
      message: campaignCaption(campaign, config)
    }, true, now());
    if (typeof response.id !== 'string' || !response.id) throw new MetaApiError('Meta did not confirm a Facebook post ID.', 'MISSING_POST_ID', undefined, false);
    return { publishedId: response.id };
  };

  const publishInstagram = async (campaign: Campaign, config: SocialMediaConfig): Promise<SocialPublicationResult> => {
    requiredConfig(config, 'instagram');
    let containerId = platformState(campaign, 'instagram')?.containerId;
    if (!containerId) {
      let imageUrl: URL;
      try {
        imageUrl = new URL(campaign.photoUrl);
      } catch {
        throw new MetaApiError('Instagram requires a publicly accessible HTTPS campaign image.', 'INVALID_IMAGE_URL', undefined, false);
      }
      if (imageUrl.protocol !== 'https:') {
        throw new MetaApiError('Instagram requires a publicly accessible HTTPS campaign image.', 'INVALID_IMAGE_URL', undefined, false);
      }
      const container = await postMeta(fetcher, config, `${config.instagramAccountId}/media`, {
        image_url: imageUrl.toString(),
        caption: campaignCaption(campaign, config)
      }, false, now());
      if (typeof container.id !== 'string' || !container.id) throw new MetaApiError('Meta did not confirm an Instagram media container ID.', 'MISSING_CONTAINER_ID', undefined, false);
      containerId = container.id;
      await dependencies.repository.updatePlatform(campaign.id, 'instagram', { containerId });
    }

    const result = await postMeta(fetcher, config, `${config.instagramAccountId}/media_publish`, {
      creation_id: containerId
    }, false, now());
    if (typeof result.id !== 'string' || !result.id) throw new MetaApiError('Meta did not confirm an Instagram media ID.', 'MISSING_MEDIA_ID', undefined, false);
    return { publishedId: result.id, containerId };
  };

  const publishWhatsApp = async (campaign: Campaign, config: SocialMediaConfig, retry: boolean): Promise<SocialPublicationResult> => {
    requiredConfig(config, 'whatsapp');
    const supporters = await dependencies.repository.getOptedInSupporters();
    if (supporters.length === 0) {
      throw new MetaApiError('No opted-in WhatsApp supporters are currently eligible.', 'NO_OPTED_IN_SUPPORTERS', undefined, true);
    }

    let acceptedCount = 0;
    let failedCount = 0;
    let retryableFailureCount = 0;
    let retryAfter: number | undefined;
    const caption = campaignCaption(campaign, config);
    const heartbeat = () => dependencies.repository.updatePlatform(campaign.id, 'whatsapp', {
      updatedAt: now(),
      acceptedCount,
      failedCount
    });
    for (const supporter of supporters) {
      const claim = await dependencies.repository.claimWhatsAppRecipient(campaign.id, supporter.id, retry, now());
      if (claim === 'published') {
        acceptedCount++;
        await heartbeat();
        continue;
      }
      if (claim === 'blocked') {
        failedCount++;
        await heartbeat();
        continue;
      }
      const dispatch = await dependencies.repository.authorizeWhatsAppDispatch(campaign.id, supporter.id, now());
      if (dispatch === 'blocked') {
        failedCount++;
        retryableFailureCount++;
        await heartbeat();
        continue;
      }
      try {
        // An opt-out after authorization cannot cancel or retract the following external request.
        const result = await postMeta(fetcher, config, `${config.whatsappPhoneNumberId}/messages`, {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: dispatch.phone,
          type: 'template',
          template: {
            name: config.whatsappTemplateName,
            language: { code: config.whatsappTemplateLanguage },
            components: [{
              type: 'body',
              parameters: [
                { type: 'text', text: campaign.disasterName.slice(0, 256) },
                { type: 'text', text: `${campaign.location}, ${campaign.province}`.slice(0, 256) },
                { type: 'text', text: caption.slice(0, 1000) }
              ]
            }]
          }
        }, false, now());
        const messageId = result.messages?.[0]?.id;
        if (typeof messageId !== 'string' || !messageId) throw new MetaApiError('Meta did not confirm a WhatsApp message ID.', 'MISSING_MESSAGE_ID', undefined, false);
        await dependencies.repository.updateWhatsAppRecipient(campaign.id, supporter.id, {
          status: 'published', updatedAt: now(), messageId
        });
        acceptedCount++;
      } catch (error) {
        const apiError = error instanceof MetaApiError ? error : new MetaApiError(
          error instanceof Error && error.name === 'TimeoutError'
            ? 'WhatsApp request timed out; delivery is uncertain and requires manual verification.'
            : 'WhatsApp request failed; delivery may be uncertain.',
          error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR',
          undefined,
          false
        );
        await dependencies.repository.updateWhatsAppRecipient(campaign.id, supporter.id, {
          status: 'failed',
          updatedAt: now(),
          error: apiError.message,
          errorCode: apiError.code,
          retryable: apiError.retryable,
          retryAfter: apiError.retryAfter
        });
        failedCount++;
        if (apiError.retryable) {
          retryableFailureCount++;
          retryAfter = Math.max(retryAfter || 0, apiError.retryAfter || 0) || undefined;
        }
      }
      await heartbeat();
    }

    return {
      acceptedCount,
      failedCount,
      retryable: retryableFailureCount > 0,
      retryAfter,
      ...(failedCount ? { error: `${failedCount} opted-in WhatsApp message(s) failed.` } : {})
    };
  };

  const publishPlatform = async (campaignId: string, platform: SocialPlatform, retry = false): Promise<void> => {
    const existingCampaign = await dependencies.repository.getCampaign(campaignId);
    validateApproved(existingCampaign, dependencies.isAdminUid);
    const claimCampaign = await dependencies.repository.claimPlatform(
      campaignId, platform, retry, now(), dependencies.isAdminUid
    );
    if (!claimCampaign) throw new SocialPublicationBusyError();

    try {
      const config = getConfig();
      const result = platform === 'facebook'
        ? await publishFacebook(claimCampaign, config)
        : platform === 'instagram'
          ? await publishInstagram(claimCampaign, config)
          : await publishWhatsApp(claimCampaign, config, retry);
      await dependencies.repository.updatePlatform(campaignId, platform, {
        status: result.failedCount ? 'failed' : 'published',
        publishedId: result.publishedId,
        containerId: result.containerId,
        acceptedCount: result.acceptedCount,
        failedCount: result.failedCount,
        error: result.error,
        errorCode: result.failedCount ? result.errorCode || 'PARTIAL_WHATSAPP_FAILURE' : undefined,
        retryable: result.retryable || false,
        retryAfter: result.retryAfter,
        updatedAt: now()
      });
    } catch (error) {
      const configurationError = error instanceof SocialMediaConfigurationError;
      const metaError = error instanceof MetaApiError ? error : null;
      const timeout = error instanceof Error && error.name === 'TimeoutError';
      const message = configurationError
        ? (error as Error).message
        : metaError
          ? metaError.message
        : timeout
          ? 'Meta request timed out; the result may be unknown. Verify the platform before retrying.'
          : 'Meta request failed; the result may be unknown. Verify the platform before retrying.';
      await dependencies.repository.updatePlatform(campaignId, platform, {
        status: 'failed',
        error: cleanMetaMessage(message),
        errorCode: configurationError
          ? 'MISSING_CONFIGURATION'
          : metaError?.code || (timeout ? 'TIMEOUT' : 'NETWORK_ERROR'),
        retryAfter: metaError?.retryAfter,
        retryable: configurationError || metaError?.retryable || false,
        updatedAt: now()
      });
    }
  };

  return {
    publishApprovedCampaign: async (campaignId: string): Promise<void> => {
      const campaign = await dependencies.repository.getCampaign(campaignId);
      validateApproved(campaign, dependencies.isAdminUid);
      await Promise.all((['facebook', 'instagram', 'whatsapp'] as SocialPlatform[])
        .map(platform => publishPlatform(campaignId, platform)));
    },
    retryPlatform: async (campaignId: string, platform: SocialPlatform): Promise<void> => {
      await publishPlatform(campaignId, platform, true);
    }
  };
}
