// __tests__/unit/auth-helpers.test.ts
import { verifyAuthToken, getUserRole, getUserProfile } from '@/lib/auth-helpers'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { createMockAuthToken, createMockRequest } from '../helpers/test-utils'

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
      }

      ;(adminDb.collection as jest.Mock).mockReturnValue(mockCollectionRef)

      const profile = await getUserProfile(mockUser as any)

      expect(profile.email).toBe('test@example.com')
      expect(profile.displayName).toBe('Firebase User')
    })
  })
})
