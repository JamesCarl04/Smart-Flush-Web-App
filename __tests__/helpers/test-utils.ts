// __tests__/helpers/test-utils.ts
import { NextRequest, NextResponse } from 'next/server'
import type { DecodedIdToken } from 'firebase-admin/auth'

/**
 * Mock Firebase Auth token for testing
 */
export function createMockAuthToken(overrides?: Partial<DecodedIdToken>): DecodedIdToken {
  return {
    iss: 'https://securetoken.google.com/test-project',
    aud: 'test-project',
    auth_time: Math.floor(Date.now() / 1000),
    user_id: 'test-user-123',
    sub: 'test-user-123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: 'test@example.com',
    email_verified: true,
    firebase: {
      identities: {
        'google.com': ['123456789'],
      },
      sign_in_provider: 'google.com',
    },
    ...overrides,
  } as DecodedIdToken
}

/**
 * Create a mock NextRequest with auth header
 */
export function createMockRequest(
  method: string = 'GET',
  body?: unknown,
  token?: string,
): Request {
  const headers = new Headers()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  headers.set('Content-Type', 'application/json')

  return new Request('http://localhost:3000/api/test', {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Parse JSON response body
 */
export async function getResponseJson(response: Response): Promise<unknown> {
  return response.json()
}

/**
 * Test utilities for API route testing
 */
export const testApiHelper = {
  /**
   * Extract error message from error response
   */
  getErrorMessage(body: any): string | null {
    return body?.error || null
  },

  /**
   * Check if response indicates success
   */
  isSuccessResponse(body: any): boolean {
    return body?.success === true
  },

  /**
   * Simulate a 401 Unauthorized response
   */
  create401Response(): NextResponse {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  },

  /**
   * Simulate a 403 Forbidden response
   */
  create403Response(): NextResponse {
    return NextResponse.json(
      { success: false, error: 'Forbidden: admin only' },
      { status: 403 },
    )
  },

  /**
   * Simulate a 429 Rate Limited response
   */
  create429Response(): NextResponse {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  },
}

/**
 * Mock Firestore helpers
 */
export const mockFirestoreHelper = {
  /**
   * Create a mock user document
   */
  createMockUserDoc(overrides?: Partial<any>) {
    return {
      id: 'test-user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'user',
      createdAt: new Date(),
      ...overrides,
    }
  },

  /**
   * Create a mock device document
   */
  createMockDeviceDoc(overrides?: Partial<any>) {
    return {
      id: 'toilet-01',
      name: 'Main Restroom',
      location: 'Ground Floor',
      status: 'online',
      lastSeen: new Date(),
      config: {
        pumpDuration: 3,
        uvDuration: 30,
        threshold: 50,
      },
      ...overrides,
    }
  },

  /**
   * Create a mock task document
   */
  createMockTaskDoc(overrides?: Partial<any>) {
    return {
      id: 'task-123',
      deviceId: 'toilet-01',
      status: 'pending',
      priority: 'high',
      createdAt: new Date(),
      assignedTo: 'maintenance-user-456',
      message: 'Cleaning required',
      ...overrides,
    }
  },

  /**
   * Create a mock alert document
   */
  createMockAlertDoc(overrides?: Partial<any>) {
    return {
      id: 'alert-123',
      type: 'low_water',
      message: 'Water level critically low',
      severity: 'high',
      deviceId: 'toilet-01',
      acknowledged: false,
      timestamp: new Date(),
      ...overrides,
    }
  },
}
