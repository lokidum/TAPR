import * as docusign from 'docusign-esign';
import logger from '../utils/logger';

const JWT_SCOPES = 'signature impersonation';
const TOKEN_BUFFER_SECONDS = 300;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let _cachedToken: CachedToken | null = null;

function getPrivateKey(): string {
  const key = process.env.DOCUSIGN_RSA_PRIVATE_KEY;
  if (!key) {
    throw new Error('DOCUSIGN_RSA_PRIVATE_KEY environment variable is required');
  }
  return key;
}

function getIntegrationKey(): string {
  const key = process.env.DOCUSIGN_INTEGRATION_KEY;
  if (!key) {
    throw new Error('DOCUSIGN_INTEGRATION_KEY environment variable is required');
  }
  return key;
}

function getUserId(): string {
  const id = process.env.DOCUSIGN_USER_ID;
  if (!id) {
    throw new Error('DOCUSIGN_USER_ID environment variable is required');
  }
  return id;
}

function getAccountId(): string {
  const id = process.env.DOCUSIGN_ACCOUNT_ID;
  if (!id) {
    throw new Error('DOCUSIGN_ACCOUNT_ID environment variable is required');
  }
  return id;
}

function getTemplateId(): string {
  const id = process.env.DOCUSIGN_PARTNERSHIP_TEMPLATE_ID;
  if (!id) {
    throw new Error('DOCUSIGN_PARTNERSHIP_TEMPLATE_ID environment variable is required');
  }
  return id;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _cachedToken.expiresAt > now + TOKEN_BUFFER_SECONDS) {
    return _cachedToken.accessToken;
  }

  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(
    process.env.DOCUSIGN_OAUTH_BASE_PATH ?? 'account-d.docusign.com'
  );

  const results = await apiClient.requestJWTUserToken(
    getIntegrationKey(),
    getUserId(),
    JWT_SCOPES,
    getPrivateKey(),
    3600
  );

  const body = results.body as { access_token: string; expires_in: number };
  _cachedToken = {
    accessToken: body.access_token,
    expiresAt: now + body.expires_in,
  };

  logger.debug('DocuSign JWT token refreshed');
  return _cachedToken.accessToken;
}

async function getEnvelopesApi(): Promise<docusign.EnvelopesApi> {
  const accessToken = await getAccessToken();
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(
    process.env.DOCUSIGN_BASE_PATH ?? 'https://demo.docusign.net/restapi'
  );
  apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);
  return new docusign.EnvelopesApi(apiClient);
}

export interface CreatePartnershipEnvelopeParams {
  initiatorEmail: string;
  initiatorName: string;
  partnerEmail: string;
  partnerName: string;
  businessName: string;
  state: string;
  equitySplitInitiator: number;
  equitySplitPartner: number;
  platformEquityPct: number;
  vestingMonths: number;
  cliffMonths: number;
}

export async function createPartnershipEnvelope(
  params: CreatePartnershipEnvelopeParams
): Promise<{ envelopeId: string }> {
  const templateId = getTemplateId();
  const accountId = getAccountId();

  const textTabs: Array<{ tabLabel: string; value: string }> = [
    { tabLabel: 'InitiatorName', value: params.initiatorName },
    { tabLabel: 'PartnerName', value: params.partnerName },
    { tabLabel: 'BusinessName', value: params.businessName },
    { tabLabel: 'State', value: params.state },
    { tabLabel: 'EquitySplitInitiator', value: String(params.equitySplitInitiator) },
    { tabLabel: 'EquitySplitPartner', value: String(params.equitySplitPartner) },
    { tabLabel: 'PlatformEquityPct', value: String(params.platformEquityPct) },
    { tabLabel: 'VestingMonths', value: String(params.vestingMonths) },
    { tabLabel: 'CliffMonths', value: String(params.cliffMonths) },
  ];

  const envelopeDefinition: docusign.EnvelopeDefinition = {
    templateId,
    status: 'sent',
    templateRoles: [
      {
        roleName: 'Initiator',
        email: params.initiatorEmail,
        name: params.initiatorName,
        routingOrder: '1',
        tabs: { textTabs },
      },
      {
        roleName: 'Partner',
        email: params.partnerEmail,
        name: params.partnerName,
        routingOrder: '2',
      },
    ],
  };

  const envelopesApi = await getEnvelopesApi();
  const result = await envelopesApi.createEnvelope(accountId, {
    envelopeDefinition,
  });

  const summary = result.body as docusign.EnvelopeSummary;
  return { envelopeId: summary.envelopeId ?? '' };
}

export async function downloadSignedDocument(envelopeId: string): Promise<Buffer> {
  const accountId = getAccountId();
  const envelopesApi = await getEnvelopesApi();

  const result = await envelopesApi.getDocument(
    accountId,
    envelopeId,
    'combined',
    {}
  );

  const body = result.body;
  if (body instanceof Buffer) {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (typeof body === 'string') {
    return Buffer.from(body, 'base64');
  }
  if (body && typeof (body as { data?: unknown }).data !== 'undefined') {
    const data = (body as { data: string }).data;
    return Buffer.from(data, 'base64');
  }
  throw new Error('Unexpected DocuSign document response format');
}
