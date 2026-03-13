const mockSendEachForMulticast = jest.fn();
const mockMessaging = jest.fn(() => ({ sendEachForMulticast: mockSendEachForMulticast }));
const mockCredentialCert = jest.fn();
const mockInitializeApp = jest.fn(() => ({}));

jest.mock('firebase-admin', () => ({
  initializeApp: mockInitializeApp,
  credential: { cert: mockCredentialCert },
  messaging: mockMessaging,
}));

jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    deviceToken: {
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}));

import { prisma } from '../src/services/prisma.service';
import { sendPushNotification } from '../src/services/notifications.service';

const mockFindMany = (prisma.deviceToken as jest.Mocked<typeof prisma.deviceToken>).findMany as jest.Mock;
const mockDelete = (prisma.deviceToken as jest.Mocked<typeof prisma.deviceToken>).delete as jest.Mock;
const mockNotificationCreate = (prisma.notification as jest.Mocked<typeof prisma.notification>).create as jest.Mock;

beforeAll(() => {
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    private_key_id: 'key-id',
    private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
    client_email: 'test@test.iam.gserviceaccount.com',
    client_id: '123',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
  });
});

afterAll(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCredentialCert.mockReturnValue({});
  mockMessaging.mockReturnValue({ sendEachForMulticast: mockSendEachForMulticast });
});

describe('sendPushNotification', () => {
  it('saves notification and skips FCM when user has no tokens', async () => {
    mockFindMany.mockResolvedValue([]);

    await sendPushNotification({
      userId: 'user-1',
      title: 'Hello',
      body: 'World',
      type: 'TEST',
    });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { id: true, token: true },
    });
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'TEST',
        title: 'Hello',
        body: 'World',
        data: undefined,
        sentVia: [],
      },
    });
  });

  it('sends FCM and saves notification when user has tokens', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'dt-1', token: 'token-abc' },
      { id: 'dt-2', token: 'token-def' },
    ]);
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });

    await sendPushNotification({
      userId: 'user-1',
      title: 'Hi',
      body: 'There',
      data: { bookingId: 'b1' },
      type: 'BOOKING',
    });

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: { title: 'Hi', body: 'There' },
        data: expect.objectContaining({ type: 'BOOKING', bookingId: 'b1' }),
        tokens: ['token-abc', 'token-def'],
      })
    );
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'BOOKING',
        title: 'Hi',
        body: 'There',
        data: { bookingId: 'b1' },
        sentVia: ['push'],
      },
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes invalid token when FCM returns invalid-registration-token', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'dt-1', token: 'valid-token' },
      { id: 'dt-2', token: 'invalid-token' },
    ]);
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        {
          success: false,
          error: { code: 'messaging/invalid-registration-token' },
        },
      ],
    });

    await sendPushNotification({
      userId: 'user-1',
      title: 'Test',
      body: 'Body',
      type: 'TEST',
    });

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'dt-2' } });
    expect(mockNotificationCreate).toHaveBeenCalled();
  });

  it('deletes invalid token when FCM returns registration-token-not-registered', async () => {
    mockFindMany.mockResolvedValue([{ id: 'dt-1', token: 'old-token' }]);
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      responses: [
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
      ],
    });

    await sendPushNotification({
      userId: 'user-1',
      title: 'Test',
      body: 'Body',
      type: 'TEST',
    });

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'dt-1' } });
    expect(mockNotificationCreate).toHaveBeenCalled();
  });

  it('saves notification even when FCM throws', async () => {
    mockFindMany.mockResolvedValue([{ id: 'dt-1', token: 'token' }]);
    mockSendEachForMulticast.mockRejectedValue(new Error('Network error'));

    await sendPushNotification({
      userId: 'user-1',
      title: 'Test',
      body: 'Body',
      type: 'TEST',
    });

    expect(mockNotificationCreate).toHaveBeenCalled();
  });
});
