const mockRequestJWTUserToken = jest.fn();
const mockCreateEnvelope = jest.fn();
const mockGetDocument = jest.fn();

jest.mock('docusign-esign', () => ({
  ApiClient: jest.fn().mockImplementation(() => ({
    setOAuthBasePath: jest.fn(),
    setBasePath: jest.fn(),
    addDefaultHeader: jest.fn(),
    requestJWTUserToken: mockRequestJWTUserToken,
  })),
  EnvelopesApi: jest.fn().mockImplementation(() => ({
    createEnvelope: mockCreateEnvelope,
    getDocument: mockGetDocument,
  })),
}));

import {
  createPartnershipEnvelope,
  downloadSignedDocument,
} from '../src/services/docusign.service';

beforeAll(() => {
  process.env.DOCUSIGN_RSA_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';
  process.env.DOCUSIGN_INTEGRATION_KEY = 'integration-key';
  process.env.DOCUSIGN_USER_ID = 'user-guid';
  process.env.DOCUSIGN_ACCOUNT_ID = 'account-id';
  process.env.DOCUSIGN_PARTNERSHIP_TEMPLATE_ID = 'template-id';
});

afterAll(() => {
  delete process.env.DOCUSIGN_RSA_PRIVATE_KEY;
  delete process.env.DOCUSIGN_INTEGRATION_KEY;
  delete process.env.DOCUSIGN_USER_ID;
  delete process.env.DOCUSIGN_ACCOUNT_ID;
  delete process.env.DOCUSIGN_PARTNERSHIP_TEMPLATE_ID;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestJWTUserToken.mockResolvedValue({
    body: { access_token: 'token', expires_in: 3600 },
  });
});

describe('createPartnershipEnvelope', () => {
  it('creates envelope with template and returns envelopeId', async () => {
    mockCreateEnvelope.mockResolvedValue({ body: { envelopeId: 'env-123' } });

    const result = await createPartnershipEnvelope({
      initiatorEmail: 'init@example.com',
      initiatorName: 'Initiator',
      partnerEmail: 'partner@example.com',
      partnerName: 'Partner',
      businessName: 'Biz Co',
      state: 'NSW',
      equitySplitInitiator: 46,
      equitySplitPartner: 47,
      platformEquityPct: 7,
      vestingMonths: 48,
      cliffMonths: 12,
    });

    expect(result).toEqual({ envelopeId: 'env-123' });
    expect(mockCreateEnvelope).toHaveBeenCalledWith(
      'account-id',
      expect.objectContaining({
        envelopeDefinition: expect.objectContaining({
          templateId: 'template-id',
          status: 'sent',
          templateRoles: expect.arrayContaining([
            expect.objectContaining({
              roleName: 'Initiator',
              email: 'init@example.com',
              name: 'Initiator',
              routingOrder: '1',
              tabs: expect.objectContaining({
                textTabs: expect.arrayContaining([
                  expect.objectContaining({ tabLabel: 'InitiatorName', value: 'Initiator' }),
                  expect.objectContaining({ tabLabel: 'PartnerName', value: 'Partner' }),
                  expect.objectContaining({ tabLabel: 'BusinessName', value: 'Biz Co' }),
                  expect.objectContaining({ tabLabel: 'State', value: 'NSW' }),
                  expect.objectContaining({ tabLabel: 'EquitySplitInitiator', value: '46' }),
                  expect.objectContaining({ tabLabel: 'EquitySplitPartner', value: '47' }),
                  expect.objectContaining({ tabLabel: 'PlatformEquityPct', value: '7' }),
                  expect.objectContaining({ tabLabel: 'VestingMonths', value: '48' }),
                  expect.objectContaining({ tabLabel: 'CliffMonths', value: '12' }),
                ]),
              }),
            }),
            expect.objectContaining({
              roleName: 'Partner',
              email: 'partner@example.com',
              name: 'Partner',
              routingOrder: '2',
            }),
          ]),
        }),
      })
    );
  });
});

describe('downloadSignedDocument', () => {
  it('returns Buffer when body is Buffer', async () => {
    const pdfBuffer = Buffer.from('pdf content');
    mockGetDocument.mockResolvedValue({ body: pdfBuffer });

    const result = await downloadSignedDocument('env-123');

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toBe('pdf content');
    expect(mockGetDocument).toHaveBeenCalledWith('account-id', 'env-123', 'combined', {});
  });

  it('returns Buffer when body is base64 string', async () => {
    const pdfBuffer = Buffer.from('pdf content');
    mockGetDocument.mockResolvedValue({ body: pdfBuffer.toString('base64') });

    const result = await downloadSignedDocument('env-123');

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toBe('pdf content');
  });

  it('returns Buffer when body has data property', async () => {
    const pdfBuffer = Buffer.from('pdf content');
    mockGetDocument.mockResolvedValue({ body: { data: pdfBuffer.toString('base64') } });

    const result = await downloadSignedDocument('env-123');

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toBe('pdf content');
  });

  it('throws when body format is unexpected', async () => {
    mockGetDocument.mockResolvedValue({ body: { unknown: 'format' } });

    await expect(downloadSignedDocument('env-123')).rejects.toThrow(
      'Unexpected DocuSign document response format'
    );
  });
});
