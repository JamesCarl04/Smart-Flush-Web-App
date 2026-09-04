jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn(),
  getUserRole: jest.fn(),
  requireAdmin: jest.fn(),
  requireMaintenance: jest.fn(),
  requireSupervisorOrAdmin: jest.fn(),
  requireNotViewer: jest.fn(),
}));

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: jest.fn(),
    runTransaction: jest.fn(),
    batch: jest.fn(),
  },
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => 'server-timestamp'),
  },
  Timestamp: {
    now: jest.fn(() => ({ toMillis: () => 1000 })),
  },
}));

import { DELETE as deleteTask } from '@/app/api/tasks/[id]/route';
import { POST as flagTask } from '@/app/api/supervisor/flag-task/route';
import { POST as approveTask } from '@/app/api/supervisor/approve-task/route';
import { POST as cleanupSpam } from '@/app/api/tasks/cleanup-spam/route';
import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken, getUserRole } from '@/lib/auth-helpers';

const mockVerifyAuthToken = verifyAuthToken as jest.Mock;
const mockGetUserRole = getUserRole as jest.Mock;

describe('Security Remediations API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('DELETE /api/tasks/[id]', () => {
    it('blocks maintenance, technician, and viewer roles from deleting tasks', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'maint-1' });

      for (const role of ['maintenance', 'technician', 'viewer', 'user']) {
        mockGetUserRole.mockResolvedValue(role);

        const request = new Request('http://localhost/api/tasks/task-1', { method: 'DELETE' });
        const response = await deleteTask(request, { params: Promise.resolve({ id: 'task-1' }) });

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Forbidden: admin or supervisor only');
      }
    });

    it('permits admin to delete tasks', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockGetUserRole.mockResolvedValue('admin');

      const mockDocRef = {
        id: 'task-1',
        get: jest.fn().mockResolvedValue({
          exists: true,
          id: 'task-1',
          data: () => ({ id: 'task-1', createdBy: 'someone' }),
        }),
        delete: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
      };
      const mockCol = {
        doc: jest.fn(() => mockDocRef),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
      (adminDb.collection as jest.Mock).mockReturnValue(mockCol);
      (adminDb.runTransaction as jest.Mock).mockImplementation(async (cb) => {
        await cb({
          get: jest.fn().mockResolvedValue({
            exists: true,
            id: 'task-1',
            data: () => ({ assignedTo: 'tech-1' }),
            docs: [],
          }),
          delete: jest.fn(),
          set: jest.fn(),
          update: jest.fn(),
        });
      });

      const request = new Request('http://localhost/api/tasks/task-1', { method: 'DELETE' });
      const response = await deleteTask(request, { params: Promise.resolve({ id: 'task-1' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('Supervisor identity binding', () => {
    it('binds flag-task inspectedBy strictly to verified user.uid', async () => {
      mockVerifyAuthToken.mockResolvedValue({
        uid: 'verified-supervisor-id',
        email: 'supervisor@example.com',
      });
      mockGetUserRole.mockResolvedValue('supervisor');

      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const mockDoc = {
        get: jest.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
        update: mockUpdate,
      };
      (adminDb.collection as jest.Mock).mockReturnValue({
        doc: jest.fn(() => mockDoc),
      });

      const request = new Request('http://localhost/api/supervisor/flag-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: 'task-1',
          reason: 'Need redo',
          supervisorUid: 'spoofed-attacker-id',
        }),
      });

      const response = await flagTask(request);
      expect(response.status).toBe(200);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          inspectedBy: 'verified-supervisor-id',
          supervisorUid: 'verified-supervisor-id',
        }),
      );
    });

    it('binds approve-task inspectedBy strictly to verified user.uid', async () => {
      mockVerifyAuthToken.mockResolvedValue({
        uid: 'verified-supervisor-id',
        email: 'supervisor@example.com',
      });
      mockGetUserRole.mockResolvedValue('supervisor');

      const mockUpdate = jest.fn();
      (adminDb.runTransaction as jest.Mock).mockImplementation(async (cb) => {
        return await cb({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({ status: 'completed' }),
          }),
          update: mockUpdate,
          set: jest.fn(),
        });
      });

      const mockDoc = { id: 'task-1' };
      (adminDb.collection as jest.Mock).mockReturnValue({
        doc: jest.fn(() => mockDoc),
      });

      const request = new Request('http://localhost/api/supervisor/approve-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: 'task-1',
          supervisorUid: 'spoofed-attacker-id',
        }),
      });

      const response = await approveTask(request);
      expect(response.status).toBe(200);

      expect(mockUpdate).toHaveBeenCalledWith(
        mockDoc,
        expect.objectContaining({
          inspectedBy: 'verified-supervisor-id',
        }),
      );
    });
  });

  describe('Cleanup spam batch chunking', () => {
    it('chunks >400 docs across multiple batches', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockGetUserRole.mockResolvedValue('admin');

      const fakeDocs = Array.from({ length: 850 }, (_, i) => ({
        ref: { id: `task-${i}` },
      }));

      const mockWhere = {
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: fakeDocs,
        }),
      };
      (adminDb.collection as jest.Mock).mockReturnValue({
        where: jest.fn(() => mockWhere),
      });

      const commitMock = jest.fn().mockResolvedValue(undefined);
      const deleteMock = jest.fn();
      (adminDb.batch as jest.Mock).mockImplementation(() => ({
        delete: deleteMock,
        commit: commitMock,
      }));

      const request = new Request('http://localhost/api/tasks/cleanup-spam', {
        method: 'POST',
      });
      const response = await cleanupSpam(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.deletedCount).toBe(850);

      // 850 docs with batch size 400 should trigger ceil(850/400) = 3 batch commits
      expect(commitMock).toHaveBeenCalledTimes(3);
      expect(deleteMock).toHaveBeenCalledTimes(850);
    });
  });

  describe('Edge Middleware Security Headers', () => {
    it('attaches security headers to responses', () => {
      const request = new NextRequest('http://localhost/dashboard');
      const response = middleware(request);

      expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    });
  });
});
