/**
 * Integration tests for Staff Management and Register API routes.
 * Tests authorization enforcement, data transformation, validation, and deactivation.
 */

jest.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    createUser: jest.fn(),
    getUser: jest.fn(),
    updateUser: jest.fn(),
    generatePasswordResetLink: jest.fn(),
  },
  adminDb: {
    collection: jest.fn(),
  },
}));

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn(),
  requireAdmin: jest.fn(),
  getUserRole: jest.fn(),
}));

jest.mock('@/lib/password-validator', () => ({
  validatePassword: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => 'server-timestamp'),
  },
}));

import { POST as registerUser } from '@/app/api/auth/register/route';
import { GET as getStaff, POST as createStaff } from '@/app/api/staff/route';
import { PATCH as updateStaff, POST as resetStaffPassword } from '@/app/api/staff/[id]/route';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken, requireAdmin } from '@/lib/auth-helpers';

const mockAdminAuth = adminAuth as jest.Mocked<typeof adminAuth>;
const mockAdminDb = adminDb as jest.Mocked<typeof adminDb>;
const mockVerifyAuthToken = verifyAuthToken as jest.Mock;
const mockRequireAdmin = requireAdmin as jest.Mock;

const originalFetch = global.fetch;

describe('Staff Management and Registration APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('POST /api/auth/register (Locked Down)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      mockVerifyAuthToken.mockRejectedValue(
        new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 }),
      );

      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@sdca.edu.ph', password: 'Password123!@#', displayName: 'Test' }),
      });

      const res = await registerUser(req);
      expect(res.status).toBe(401);
    });

    it('rejects non-admin authenticated users with 403', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'user-1' });
      mockRequireAdmin.mockRejectedValue(
        new Response(JSON.stringify({ success: false, error: 'Forbidden: admin only' }), { status: 403 }),
      );

      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@sdca.edu.ph', password: 'Password123!@#', displayName: 'Test' }),
      });

      const res = await registerUser(req);
      expect(res.status).toBe(403);
    });

    it('allows admin users to provision a new user account', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);
      mockAdminAuth.createUser.mockResolvedValue({ uid: 'new-user-uid' } as any);

      const mockDocSet = jest.fn().mockResolvedValue(undefined);
      mockAdminDb.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ set: mockDocSet }),
      } as any);

      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@sdca.edu.ph',
          password: 'SecurePassword123!',
          displayName: 'New User',
          role: 'technician',
        }),
      });

      const res = await registerUser(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.uid).toBe('new-user-uid');
      expect(mockDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-user-uid',
          email: 'newuser@sdca.edu.ph',
          role: 'technician',
        }),
      );
    });
  });

  describe('GET /api/staff', () => {
    it('enforces admin-only authorization', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'tech-1' });
      mockRequireAdmin.mockRejectedValue(
        new Response(JSON.stringify({ success: false, error: 'Forbidden: admin only' }), { status: 403 }),
      );

      const req = new Request('http://localhost/api/staff', { method: 'GET' });
      const res = await getStaff(req);
      expect(res.status).toBe(403);
    });

    it('returns staff personnel enriched with task and active status', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);

      const mockUsers = [
        {
          id: 'u1',
          data: () => ({
            displayName: 'Tech Maria',
            email: 'maria@sdca.edu.ph',
            role: 'technician',
            building: 'Main Campus',
            shift: '1st',
            active: true,
            status: 'online',
          }),
        },
        {
          id: 'u2',
          data: () => ({
            displayName: 'Supervisor Juan',
            email: 'juan@sdca.edu.ph',
            role: 'supervisor',
            building: 'SDCA Annex',
            shift: '2nd',
            active: false,
            status: 'offline',
          }),
        },
        {
          id: 'u3',
          data: () => ({
            displayName: 'Regular Visitor',
            email: 'visitor@gmail.com',
            role: 'user', // should be excluded from staff roster
          }),
        },
      ];

      const mockTasks = [
        {
          id: 'task-999',
          data: () => ({
            assignedTo: 'u1',
            status: 'assigned',
          }),
        },
      ];

      mockAdminDb.collection.mockImplementation((col: string) => {
        if (col === 'users') {
          return { get: jest.fn().mockResolvedValue({ docs: mockUsers }) } as any;
        }
        if (col === 'tasks') {
          return {
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({ docs: mockTasks }),
            }),
          } as any;
        }
        return {} as any;
      });

      const req = new Request('http://localhost/api/staff', { method: 'GET' });
      const res = await getStaff(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.length).toBe(2);

      const maria = json.data.find((s: any) => s.id === 'u1');
      expect(maria.currentTaskId).toBe('task-999');
      expect(maria.active).toBe(true);
      expect(maria.isAvailable).toBe(false); // because she has an active task

      const juan = json.data.find((s: any) => s.id === 'u2');
      expect(juan.active).toBe(false);
      expect(juan.isAvailable).toBe(false); // because deactivated
    });

    it('resolves technician assigned by email as On Task and isAvailable: false', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);

      const mockUsers = [
        {
          id: 'u-email',
          data: () => ({
            displayName: 'Email Tech',
            email: 'emailtech@sdca.edu.ph',
            role: 'technician',
            active: true,
            status: 'online',
          }),
        },
      ];

      const mockTasks = [
        {
          id: 'task-email-assign',
          data: () => ({
            assignedTo: 'emailtech@sdca.edu.ph',
            status: 'assigned',
            location: '2nd Floor Restroom',
            message: 'Repair flush valve',
          }),
        },
      ];

      mockAdminDb.collection.mockImplementation((col: string) => {
        if (col === 'users') {
          return { get: jest.fn().mockResolvedValue({ docs: mockUsers }) } as any;
        }
        if (col === 'tasks') {
          return {
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({ docs: mockTasks }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await getStaff(new Request('http://localhost/api/staff', { method: 'GET' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      const tech = json.data.find((s: any) => s.id === 'u-email');
      expect(tech.currentTaskId).toBe('task-email-assign');
      expect(tech.isAvailable).toBe(false);
      expect(tech.activeTask).toEqual(
        expect.objectContaining({
          id: 'task-email-assign',
          location: '2nd Floor Restroom',
          message: 'Repair flush valve',
        }),
      );
    });

    it('discards stale currentTaskId when task is deleted or completed and marks available', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);

      const mockUsers = [
        {
          id: 'u-stale',
          data: () => ({
            displayName: 'Stale Tech',
            email: 'stale@sdca.edu.ph',
            role: 'technician',
            active: true,
            status: 'online',
            currentTaskId: 'deleted-task-404',
          }),
        },
      ];

      mockAdminDb.collection.mockImplementation((col: string) => {
        if (col === 'users') {
          return { get: jest.fn().mockResolvedValue({ docs: mockUsers }) } as any;
        }
        if (col === 'tasks') {
          return {
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({ docs: [] }), // Task was deleted
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await getStaff(new Request('http://localhost/api/staff', { method: 'GET' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      const tech = json.data.find((s: any) => s.id === 'u-stale');
      expect(tech.currentTaskId).toBeNull();
      expect(tech.activeTask).toBeNull();
      expect(tech.isAvailable).toBe(true);
    });

    it('resolves technician busy when referenced in acknowledgedBy or recheckedBy', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);

      const mockUsers = [
        {
          id: 'u-ack',
          data: () => ({
            displayName: 'Ack Tech',
            email: 'ack@sdca.edu.ph',
            role: 'technician',
            active: true,
            status: 'online',
          }),
        },
        {
          id: 'u-recheck',
          data: () => ({
            displayName: 'Recheck Tech',
            email: 'recheck@sdca.edu.ph',
            role: 'technician',
            active: true,
            status: 'online',
          }),
        },
      ];

      const mockTasks = [
        {
          id: 'task-ack',
          data: () => ({
            status: 'acknowledged',
            acknowledgedBy: { 'u-ack': 123456789 },
          }),
        },
        {
          id: 'task-recheck',
          data: () => ({
            status: 'rechecking',
            recheckedBy: 'u-recheck',
          }),
        },
      ];

      mockAdminDb.collection.mockImplementation((col: string) => {
        if (col === 'users') {
          return { get: jest.fn().mockResolvedValue({ docs: mockUsers }) } as any;
        }
        if (col === 'tasks') {
          return {
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({ docs: mockTasks }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await getStaff(new Request('http://localhost/api/staff', { method: 'GET' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      const ackTech = json.data.find((s: any) => s.id === 'u-ack');
      expect(ackTech.currentTaskId).toBe('task-ack');
      expect(ackTech.isAvailable).toBe(false);

      const recheckTech = json.data.find((s: any) => s.id === 'u-recheck');
      expect(recheckTech.currentTaskId).toBe('task-recheck');
      expect(recheckTech.isAvailable).toBe(false);
    });

    it('does not mark technician busy when a broadcast pending task is unassigned', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);

      const mockUsers = [
        {
          id: 'u-free',
          data: () => ({
            displayName: 'Free Tech',
            email: 'free@sdca.edu.ph',
            role: 'technician',
            active: true,
            status: 'online',
          }),
        },
      ];

      const mockTasks = [
        {
          id: 'task-broadcast',
          data: () => ({
            status: 'pending',
            isBroadcast: true,
            assignmentType: 'broadcast',
            assignedTo: null,
            assignedToIds: [],
          }),
        },
      ];

      mockAdminDb.collection.mockImplementation((col: string) => {
        if (col === 'users') {
          return { get: jest.fn().mockResolvedValue({ docs: mockUsers }) } as any;
        }
        if (col === 'tasks') {
          return {
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({ docs: mockTasks }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await getStaff(new Request('http://localhost/api/staff', { method: 'GET' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      const tech = json.data.find((s: any) => s.id === 'u-free');
      expect(tech.currentTaskId).toBeNull();
      expect(tech.isAvailable).toBe(true);
    });
  });

  describe('POST /api/staff', () => {
    it('validates input and provisions new staff member', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);
      mockAdminAuth.createUser.mockResolvedValue({ uid: 'new-staff-123' } as any);
      mockAdminAuth.generatePasswordResetLink.mockResolvedValue('https://auth.klir.local/reset?oobCode=xyz');

      const mockSet = jest.fn().mockResolvedValue(undefined);
      mockAdminDb.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ set: mockSet }),
      } as any);

      const req = new Request('http://localhost/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'Pedro Penduko',
          email: 'ppenduko@sdca.edu.ph',
          role: 'technician',
          building: 'SDCA Annex',
          shift: '3rd',
          sendPasswordReset: true,
        }),
      });

      const res = await createStaff(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.uid).toBe('new-staff-123');
      expect(json.resetLink).toBe('https://auth.klir.local/reset?oobCode=xyz');

      expect(mockAdminAuth.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ppenduko@sdca.edu.ph',
          displayName: 'Pedro Penduko',
        }),
      );

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-staff-123',
          email: 'ppenduko@sdca.edu.ph',
          role: 'technician',
          building: 'SDCA Annex',
          shift: '3rd',
          active: true,
          isOnline: true,
          status: 'online',
          isAvailable: true,
        }),
      );
    });

    it('rejects invalid email formats', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);

      const req = new Request('http://localhost/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'Invalid Email Person',
          email: 'not-an-email',
          role: 'technician',
        }),
      });

      const res = await createStaff(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid email address format');
    });
  });

  describe('PATCH /api/staff/[id]', () => {
    it('updates facility, shift, and deactivates account without deleting history', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);

      const mockDoc = {
        exists: true,
        data: () => ({ email: 'staff@sdca.edu.ph', role: 'technician' }),
      };
      const mockSet = jest.fn().mockResolvedValue(undefined);
      mockAdminDb.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
          set: mockSet,
        }),
      } as any);

      const req = new Request('http://localhost/api/staff/staff-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building: 'Main Campus',
          shift: '2nd',
          active: false, // deactivation
        }),
      });

      const res = await updateStaff(req, { params: Promise.resolve({ id: 'staff-1' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          building: 'Main Campus',
          shift: '2nd',
          active: false,
          isActive: false,
          isAvailable: false,
          status: 'offline',
        }),
        { merge: true },
      );
      expect(mockAdminAuth.updateUser).toHaveBeenCalledWith('staff-1', { disabled: true });
    });

    it('prevents administrator from deactivating their own account', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);

      const mockDoc = {
        exists: true,
        data: () => ({ email: 'admin@sdca.edu.ph', role: 'admin' }),
      };
      mockAdminDb.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      } as any);

      const req = new Request('http://localhost/api/staff/admin-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      });

      const res = await updateStaff(req, { params: Promise.resolve({ id: 'admin-1' }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Cannot deactivate your own administrator account');
    });

    it('prevents administrator from demoting their own administrator role', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);

      const mockDoc = {
        exists: true,
        data: () => ({ email: 'admin@sdca.edu.ph', role: 'admin' }),
      };
      mockAdminDb.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      } as any);

      const req = new Request('http://localhost/api/staff/admin-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'technician' }),
      });

      const res = await updateStaff(req, { params: Promise.resolve({ id: 'admin-1' }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Cannot remove your own administrator role');
    });

    it('restores availability and re-enables Firebase Auth user on reactivation', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);

      const mockDoc = {
        exists: true,
        data: () => ({ email: 'staff@sdca.edu.ph', role: 'technician', active: false }),
      };
      const mockSet = jest.fn().mockResolvedValue(undefined);
      mockAdminDb.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
          set: mockSet,
        }),
      } as any);

      const req = new Request('http://localhost/api/staff/staff-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      });

      const res = await updateStaff(req, { params: Promise.resolve({ id: 'staff-1' }) });
      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          active: true,
          isActive: true,
          isAvailable: true,
        }),
        { merge: true },
      );
      expect(mockAdminAuth.updateUser).toHaveBeenCalledWith('staff-1', { disabled: false });
    });
  });

  describe('POST /api/staff/[id]', () => {
    it('generates a password setup link for staff member', async () => {
      mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1' });
      mockRequireAdmin.mockResolvedValue(undefined);
      mockAdminAuth.generatePasswordResetLink.mockResolvedValue('https://auth.klir.local/reset-link');

      const mockDoc = {
        exists: true,
        data: () => ({ email: 'technician@sdca.edu.ph' }),
      };
      mockAdminDb.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      } as any);

      const req = new Request('http://localhost/api/staff/staff-1', {
        method: 'POST',
      });

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ email: 'technician@sdca.edu.ph' }),
      } as Response);

      try {
        const res = await resetStaffPassword(req, { params: Promise.resolve({ id: 'staff-1' }) });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.resetLink).toBe('https://auth.klir.local/reset-link');
        expect(json.emailDispatched).toBe(true);
        expect(mockAdminAuth.generatePasswordResetLink).toHaveBeenCalledWith('technician@sdca.edu.ph');
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('sendOobCode'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              requestType: 'PASSWORD_RESET',
              email: 'technician@sdca.edu.ph',
            }),
          }),
        );
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
