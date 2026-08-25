import { POST as requestPasswordReset } from '@/app/api/auth/password-reset/request/route';
import { POST as confirmPasswordReset } from '@/app/api/auth/password-reset/confirm/route';
import { resetRateLimitStore } from '@/lib/rate-limit';

// Global fetch mock
const originalFetch = global.fetch;

describe('Password Reset API Routes', () => {
  beforeEach(() => {
    resetRateLimitStore();
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('POST /api/auth/password-reset/request', () => {
    it('should return 400 if email is missing', async () => {
      const request = new Request('http://localhost:3000/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify({}),
      });

      const response = await requestPasswordReset(request);
      const data = (await response.json()) as { success: boolean; error: string };

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('email is required');
    });

    it('should return 200 success when email exists and email is dispatched', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ email: 'valid@example.com' }),
      } as Response);

      const request = new Request('http://localhost:3000/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify({ email: 'valid@example.com' }),
      });

      const response = await requestPasswordReset(request);
      const data = (await response.json()) as { success: boolean };

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 200 success even when email is NOT found in database (prevents account enumeration)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: { message: 'EMAIL_NOT_FOUND' },
        }),
      } as Response);

      const request = new Request('http://localhost:3000/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify({ email: 'fake@example.com' }),
      });

      const response = await requestPasswordReset(request);
      const data = (await response.json()) as { success: boolean; error?: string };

      // Crucial security behavior: Returns HTTP 200 without error so attackers cannot enumerate registered users
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.error).toBeUndefined();
    });

    it('should enforce rate limiting after exceeding max requests per IP/email', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ email: 'spam@example.com' }),
      } as Response);

      const makeRequest = () =>
        new Request('http://localhost:3000/api/auth/password-reset/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '99.88.77.66' },
          body: JSON.stringify({ email: 'spam@example.com' }),
        });

      // Limit is 5 per hour
      for (let i = 0; i < 5; i++) {
        const res = await requestPasswordReset(makeRequest());
        expect(res.status).toBe(200);
      }

      // 6th attempt should be rate limited (429)
      const blockedRes = await requestPasswordReset(makeRequest());
      expect(blockedRes.status).toBe(429);
      const blockedData = (await blockedRes.json()) as { success: boolean; error: string };
      expect(blockedData.success).toBe(false);
      expect(blockedData.error).toContain('Too many requests');
    });
  });

  describe('POST /api/auth/password-reset/confirm', () => {
    it('should validate missing oobCode', async () => {
      const request = new Request('http://localhost:3000/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify({ newPassword: 'ValidPassword123!' }),
      });

      const response = await confirmPasswordReset(request);
      const data = (await response.json()) as { success: boolean; error: string };

      expect(response.status).toBe(400);
      expect(data.error).toBe('oobCode is required');
    });

    it('should validate password length', async () => {
      const request = new Request('http://localhost:3000/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify({ oobCode: 'valid-code-123', newPassword: 'short' }),
      });

      const response = await confirmPasswordReset(request);
      const data = (await response.json()) as { success: boolean; error: string };

      expect(response.status).toBe(400);
      expect(data.error).toContain('at least 8 characters');
    });

    it('should reset password successfully with valid code and password', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ email: 'user@example.com', requestType: 'PASSWORD_RESET' }),
      } as Response);

      const request = new Request('http://localhost:3000/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify({ oobCode: 'valid-token', newPassword: 'StrongPassword123#' }),
      });

      const response = await confirmPasswordReset(request);
      const data = (await response.json()) as { success: boolean; data?: { email?: string } };

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data?.email).toBe('user@example.com');
    });
  });
});
