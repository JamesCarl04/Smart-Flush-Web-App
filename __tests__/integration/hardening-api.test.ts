import { GET as getSensorReadings } from '@/app/api/sensors/[id]/readings/route';
import { GET as downloadReport } from '@/app/api/reports/[id]/download/route';
import { POST as registerToken } from '@/app/api/tasks/register-token/route';
import { POST as registerUser } from '@/app/api/auth/register/route';
import { PUT as updateDevice } from '@/app/api/devices/[id]/route';
import { POST as flagTask } from '@/app/api/supervisor/flag-task/route';
import { POST as createAlert } from '@/app/api/alerts/route';
import { adminDb } from '@/lib/firebase-admin';
import {
  getUserRole,
  requireAdmin,
  requireMaintenance,
  requireSupervisorOrAdmin,
  verifyAuthToken,
} from '@/lib/auth-helpers';

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn(),
  getUserRole: jest.fn(),
  requireAdmin: jest.fn(),
  requireSupervisorOrAdmin: jest.fn(),
  requireMaintenance: jest.fn(),
}));

jest.mock('@/lib/password-validator', () => ({
  validatePassword: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
}));

jest.mock('@/lib/fcm', () => ({
  sendTaskNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
  },
  adminDb: {
    collection: jest.fn(),
  },
}));

const mockVerifyAuthToken = verifyAuthToken as jest.MockedFunction<typeof verifyAuthToken>;
const mockGetUserRole = getUserRole as jest.MockedFunction<typeof getUserRole>;
const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockRequireSupervisorOrAdmin = requireSupervisorOrAdmin as jest.MockedFunction<
  typeof requireSupervisorOrAdmin
>;
const mockRequireMaintenance = requireMaintenance as jest.MockedFunction<typeof requireMaintenance>;
const mockAdminDb = adminDb as unknown as { collection: jest.Mock };

describe('Hardened Web API Boundaries & Input Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAuthToken.mockResolvedValue({ uid: 'user-1', name: 'Supervisor One' } as never);
    mockGetUserRole.mockResolvedValue('supervisor');
    mockRequireAdmin.mockResolvedValue(undefined);
    mockRequireSupervisorOrAdmin.mockResolvedValue(undefined);
    mockRequireMaintenance.mockResolvedValue(undefined);
  });

  describe('GET /api/sensors/[id]/readings', () => {
    it('returns 400 on invalid calendar dates, inverted range, or >366 day span', async () => {
      const invalidReq = new Request(
        'http://localhost/api/sensors/SDCA-FL1-CANTEEN-M/readings?from=2026-02-30&to=2026-03-01',
        { headers: { Authorization: 'Bearer tok' } },
      );
      const invalidRes = await getSensorReadings(invalidReq, {
        params: Promise.resolve({ id: 'SDCA-FL1-CANTEEN-M' }),
      });
      expect(invalidRes.status).toBe(400);

      const invertedReq = new Request(
        'http://localhost/api/sensors/SDCA-FL1-CANTEEN-M/readings?from=2026-11-10&to=2026-11-01',
        { headers: { Authorization: 'Bearer tok' } },
      );
      const invertedRes = await getSensorReadings(invertedReq, {
        params: Promise.resolve({ id: 'SDCA-FL1-CANTEEN-M' }),
      });
      expect(invertedRes.status).toBe(400);

      const overLimitReq = new Request(
        'http://localhost/api/sensors/SDCA-FL1-CANTEEN-M/readings?from=2025-01-01&to=2026-01-02',
        { headers: { Authorization: 'Bearer tok' } },
      );
      const overLimitRes = await getSensorReadings(overLimitReq, {
        params: Promise.resolve({ id: 'SDCA-FL1-CANTEEN-M' }),
      });
      expect(overLimitRes.status).toBe(400);
    });
  });

  describe('GET /api/reports/[id]/download', () => {
    it('rejects maintenance technician role with 403', async () => {
      mockRequireSupervisorOrAdmin.mockRejectedValueOnce(
        new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 }),
      );
      const req = new Request('http://localhost/api/reports/rep-1/download', {
        headers: { Authorization: 'Bearer tok' },
      });
      const res = await downloadReport(req, {
        params: Promise.resolve({ id: 'rep-1' }),
      });
      expect(res.status).toBe(403);
    });

    it('returns 400 when stored report date range metadata is invalid', async () => {
      mockAdminDb.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              userId: 'user-1',
              from: '2026-02-30',
              to: '2026-03-01',
              type: 'usage_summary',
              format: 'csv',
            }),
          }),
        }),
      });

      const req = new Request('http://localhost/api/reports/rep-bad/download', {
        headers: { Authorization: 'Bearer tok' },
      });
      const res = await downloadReport(req, {
        params: Promise.resolve({ id: 'rep-bad' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/tasks/register-token', () => {
    it('enforces requireMaintenance guard and rejects oversized tokens', async () => {
      mockRequireMaintenance.mockRejectedValueOnce(
        new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 }),
      );
      const forbiddenReq = new Request('http://localhost/api/tasks/register-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({ fcmToken: 'valid-token' }),
      });
      const forbiddenRes = await registerToken(forbiddenReq);
      expect(forbiddenRes.status).toBe(403);

      const hugeReq = new Request('http://localhost/api/tasks/register-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({ fcmToken: 'x'.repeat(4097) }),
      });
      const hugeRes = await registerToken(hugeReq);
      expect(hugeRes.status).toBe(400);
    });
  });

  describe('POST /api/auth/register', () => {
    it('returns 400 when an unrecognized role is explicitly provided', async () => {
      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({
          email: 'staff@sdca.edu.ph',
          password: 'StrongPassword123!',
          displayName: 'Staff User',
          role: 'superadmin',
        }),
      });
      const res = await registerUser(req);
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/devices/[id]', () => {
    it('rejects non-string metadata fields before trimming', async () => {
      mockAdminDb.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ name: 'Unit 1' }) }),
        }),
      });
      const req = new Request('http://localhost/api/devices/SDCA-FL1-CANTEEN-M', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({ name: 12345 }),
      });
      const res = await updateDevice(req, {
        params: Promise.resolve({ id: 'SDCA-FL1-CANTEEN-M' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/supervisor/flag-task', () => {
    it('strips non-HTTPS flagPhotoUrls and persists only valid HTTPS URLs', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined);
      mockAdminDb.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({ assignedToIds: ['tech-1'] }),
          }),
          update: updateMock,
        }),
      });

      const req = new Request('http://localhost/api/supervisor/flag-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({
          taskId: 'task-1',
          reason: 'Incomplete floor cleaning',
          flagPhotoUrls: [
            'http://insecure.example/photo.jpg',
            'javascript:alert(1)',
            'https://storage.googleapis.com/smart-flush/flag-proof.jpg',
          ],
        }),
      });
      const res = await flagTask(req);
      expect(res.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          flagPhotoUrls: ['https://storage.googleapis.com/smart-flush/flag-proof.jpg'],
        }),
      );
    });

    it('rejects non-supervisor/non-admin role with 403', async () => {
      mockGetUserRole.mockResolvedValueOnce('maintenance');
      const req = new Request('http://localhost/api/supervisor/flag-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({ taskId: 'task-1', reason: 'Retest' }),
      });
      const res = await flagTask(req);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/alerts', () => {
    it('rejects blank or oversized alert messages with 400', async () => {
      const blankReq = new Request('http://localhost/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({ type: 'sensor_fault', severity: 'high', message: '   ' }),
      });
      const blankRes = await createAlert(blankReq);
      expect(blankRes.status).toBe(400);

      const longReq = new Request('http://localhost/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({
          type: 'sensor_fault',
          severity: 'high',
          message: 'a'.repeat(1001),
        }),
      });
      const longRes = await createAlert(longReq);
      expect(longRes.status).toBe(400);
    });
  });
});
