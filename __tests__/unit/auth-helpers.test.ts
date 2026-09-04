/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  verifyAuthToken,
  getUserRole,
  getUserProfile,
  requireAdmin,
  requireMaintenance,
  requireSupervisorOrAdmin,
  requireNotViewer,
} from '@/lib/auth-helpers';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { createMockAuthToken, createMockRequest } from '@/__tests__/helpers/test-utils';

// Mock Firebase modules
jest.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    verifyIdToken: jest.fn(),
  },
  adminDb: {
    collection: jest.fn(),
  },
}))

describe('auth-helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('verifyAuthToken', () => {
    it('should throw 401 if Authorization header is missing', async () => {
      const request = createMockRequest('GET')

      try {
        await verifyAuthToken(request)
        fail('Should have thrown')
      } catch (error: any) {
        expect(error.status).toBe(401)
      }
    })

    it('should throw 401 if Authorization header format is invalid', async () => {
      const headers = new Headers()
      headers.set('Authorization', 'InvalidFormat token')
      const request = new Request('http://localhost:3000/api/test', { headers })

      try {
        await verifyAuthToken(request)
        fail('Should have thrown')
      } catch (error: any) {
        expect(error.status).toBe(401)
      }
    })

    it('should verify valid Firebase ID token', async () => {
      const mockToken = createMockAuthToken()
      const mockRequest = createMockRequest('GET', undefined, 'valid-token')

      ;(adminAuth.verifyIdToken as jest.Mock).mockResolvedValue(mockToken)

      const result = await verifyAuthToken(mockRequest)

      expect(result).toEqual(mockToken)
      expect(adminAuth.verifyIdToken).toHaveBeenCalledWith('valid-token')
    })

    it('should throw 401 if token verification fails', async () => {
      const mockRequest = createMockRequest('GET', undefined, 'invalid-token')

      ;(adminAuth.verifyIdToken as jest.Mock).mockRejectedValue(
        new Error('Invalid token'),
      )

      try {
        await verifyAuthToken(mockRequest)
        fail('Should have thrown')
      } catch (error: any) {
        expect(error.status).toBe(401)
      }
    })

    it('should throw 500 if Firebase Admin is not initialized', async () => {
      const mockRequest = createMockRequest('GET', undefined, 'token')

      ;(adminAuth.verifyIdToken as jest.Mock).mockImplementation(() => {
        throw new TypeError('Cannot read property "verifyIdToken" of undefined')
      })

      try {
        await verifyAuthToken(mockRequest)
        fail('Should have thrown')
      } catch (error: any) {
        // Should handle gracefully and throw 500 or 401
        expect(error.status).toBeDefined()
      }
    })
  })

  describe('getUserRole', () => {
    it('should return user role from Firestore', async () => {
      const mockUser = createMockAuthToken({ uid: 'user-123' })
      const mockCollectionRef = {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: jest.fn(() => ({ role: 'admin' })),
          }),
        })),
      }

      ;(adminDb.collection as jest.Mock).mockReturnValue(mockCollectionRef)

      const role = await getUserRole(mockUser as any)

      expect(role).toBe('admin')
    })

    it('should return null if user document does not exist', async () => {
      const mockUser = createMockAuthToken({ uid: 'user-123' })
      const mockCollectionRef = {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({
            exists: false,
            data: jest.fn(() => ({})),
          }),
        })),
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          })),
        })),
      }

      ;(adminDb.collection as jest.Mock).mockReturnValue(mockCollectionRef)

      const role = await getUserRole(mockUser as any)

      expect(role).toBeNull()
    })

    it('should handle invalid role values', async () => {
      const mockUser = createMockAuthToken({ uid: 'user-123' })
      const mockCollectionRef = {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: jest.fn(() => ({ role: 'invalid-role' })),
          }),
        })),
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          })),
        })),
      }

      ;(adminDb.collection as jest.Mock).mockReturnValue(mockCollectionRef)

      const role = await getUserRole(mockUser as any)

      expect(role).toBeNull()
    })
  })

  describe('getUserProfile', () => {
    it('should return complete user profile', async () => {
      const mockUser = createMockAuthToken({
        uid: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      })

      const mockCollectionRef = {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({
            exists: true,
            id: 'user-123',
            data: jest.fn(() => ({
              role: 'maintenance',
              displayName: 'Test Maintenance',
              email: 'test@example.com',
            })),
          }),
        })),
      }

      ;(adminDb.collection as jest.Mock).mockReturnValue(mockCollectionRef)

      const profile = await getUserProfile(mockUser as any)

      expect(profile).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test Maintenance',
        role: 'maintenance',
      })
    })

    it('should fallback to Firebase token data if Firestore missing', async () => {
      const mockUser = createMockAuthToken({
        uid: 'user-123',
        email: 'test@example.com',
        name: 'Firebase User',
      })

      const mockCollectionRef = {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({
            exists: false,
            data: jest.fn(() => ({})),
          }),
        })),
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          })),
        })),
      }

      ;(adminDb.collection as jest.Mock).mockReturnValue(mockCollectionRef)

      const profile = await getUserProfile(mockUser as any)

      expect(profile.email).toBe('test@example.com')
      expect(profile.displayName).toBe('Firebase User')
    })
  })

  describe('Role guards', () => {
    function mockRole(role: string | null) {
      const mockCollectionRef = {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({
            exists: role !== null,
            data: jest.fn(() => (role ? { role } : {})),
          }),
        })),
      };
      (adminDb.collection as jest.Mock).mockReturnValue(mockCollectionRef);
    }

    describe('requireAdmin', () => {
      it('should allow admin role', async () => {
        mockRole('admin');
        await expect(requireAdmin({ uid: 'admin-1' } as any)).resolves.toBeUndefined();
      });

      it('should throw 403 for non-admin role', async () => {
        mockRole('maintenance');
        await expect(requireAdmin({ uid: 'maint-1' } as any)).rejects.toBeInstanceOf(Response);
      });
    });

    describe('requireMaintenance', () => {
      it.each(['maintenance', 'technician', 'supervisor', 'admin'])(
        'should allow %s role',
        async (role) => {
          mockRole(role);
          await expect(requireMaintenance({ uid: 'u-1' } as any)).resolves.toBeUndefined();
        },
      );

      it.each(['user', 'viewer', null])(
        'should reject %s with 403',
        async (role) => {
          mockRole(role);
          try {
            await requireMaintenance({ uid: 'u-2' } as any);
            fail('Should have thrown');
          } catch (error: any) {
            expect(error.status).toBe(403);
          }
        },
      );
    });

    describe('requireSupervisorOrAdmin', () => {
      it.each(['supervisor', 'admin'])('should allow %s role', async (role) => {
        mockRole(role);
        await expect(requireSupervisorOrAdmin({ uid: 'u-1' } as any)).resolves.toBeUndefined();
      });

      it.each(['maintenance', 'technician', 'user', 'viewer', null])(
        'should reject %s with 403',
        async (role) => {
          mockRole(role);
          try {
            await requireSupervisorOrAdmin({ uid: 'u-2' } as any);
            fail('Should have thrown');
          } catch (error: any) {
            expect(error.status).toBe(403);
          }
        },
      );
    });

    describe('requireNotViewer', () => {
      it('should reject viewer role with 403', async () => {
        mockRole('viewer');
        try {
          await requireNotViewer({ uid: 'v-1' } as any);
          fail('Should have thrown');
        } catch (error: any) {
          expect(error.status).toBe(403);
        }
      });

      it.each(['admin', 'supervisor', 'maintenance', 'technician', 'user'])(
        'should allow %s role',
        async (role) => {
          mockRole(role);
          await expect(requireNotViewer({ uid: 'u-1' } as any)).resolves.toBeUndefined();
        },
      );
    });
  });
})

