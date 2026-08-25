import {
  checkRateLimit,
  getClientIp,
  resetRateLimitStore,
  createRateLimitResponse,
} from '@/lib/rate-limit';

describe('Rate Limiter Utility', () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', () => {
      const config = { maxRequests: 3, windowMs: 1000 };
      const key = 'test-ip-1';

      expect(checkRateLimit(key, config).success).toBe(true);
      expect(checkRateLimit(key, config).success).toBe(true);
      expect(checkRateLimit(key, config).success).toBe(true);
    });

    it('should block requests exceeding limit', () => {
      const config = { maxRequests: 2, windowMs: 1000 };
      const key = 'test-ip-2';

      expect(checkRateLimit(key, config).success).toBe(true);
      expect(checkRateLimit(key, config).success).toBe(true);

      const blocked = checkRateLimit(key, config);
      expect(blocked.success).toBe(false);
      expect(blocked.retryAfter).toBeGreaterThan(0);
    });

    it('should separate rate limits for different keys', () => {
      const config = { maxRequests: 1, windowMs: 1000 };

      expect(checkRateLimit('key-a', config).success).toBe(true);
      expect(checkRateLimit('key-a', config).success).toBe(false);

      // key-b should still be allowed
      expect(checkRateLimit('key-b', config).success).toBe(true);
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const request = new Request('http://localhost:3000', {
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
      });
      expect(getClientIp(request)).toBe('203.0.113.195');
    });

    it('should fallback to x-real-ip header if x-forwarded-for is missing', () => {
      const request = new Request('http://localhost:3000', {
        headers: { 'x-real-ip': '198.51.100.1' },
      });
      expect(getClientIp(request)).toBe('198.51.100.1');
    });

    it('should return "unknown" when no IP headers present', () => {
      const request = new Request('http://localhost:3000');
      expect(getClientIp(request)).toBe('unknown');
    });
  });

  describe('createRateLimitResponse', () => {
    it('should create a 429 response with Retry-After header', () => {
      const response = createRateLimitResponse(45);
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('45');
    });
  });
});
