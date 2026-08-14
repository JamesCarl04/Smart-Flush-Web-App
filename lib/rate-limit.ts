// lib/rate-limit.ts
/**
 * CRITICAL FIX: Rate limiting for API endpoints
 * Prevents brute force attacks, DDoS, and account enumeration
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // milliseconds
}

type RateLimitKey = string;

// Simple in-memory rate limit store
// TODO: Replace with Upstash Redis for production/distributed deployments
const rateLimitStore = new Map<RateLimitKey, { count: number; resetTime: number }>();

/**
 * Check if a request should be rate limited
 * @param key - Unique identifier (e.g., IP address, user ID, or email)
 * @param config - Rate limit configuration
 * @returns Object with success flag and reset time if limited
 */
export function checkRateLimit(
  key: RateLimitKey,
  config: RateLimitConfig,
): { success: boolean; resetTime?: number; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now >= entry.resetTime) {
    // Create new rate limit window
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return { success: true };
  }

  if (entry.count < config.maxRequests) {
    entry.count++;
    return { success: true };
  }

  // Rate limit exceeded
  const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
  return {
    success: false,
    resetTime: entry.resetTime,
    retryAfter,
  };
}

/**
 * Extract client IP from request
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown').trim();
}

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
  // Authentication endpoints
  register: { maxRequests: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour
  login: { maxRequests: 10, windowMs: 15 * 60 * 1000 }, // 10 per 15 minutes
  passwordReset: { maxRequests: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour

  // Actuator commands (dangerous operations)
  actuators: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 per minute per user

  // Task creation
  tasks: { maxRequests: 20, windowMs: 60 * 60 * 1000 }, // 20 per hour

  // General API
  general: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 per minute
} as const;

/**
 * Create rate limit response (429 Too Many Requests)
 */
export function createRateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Too many requests. Please try again later.',
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': retryAfter.toString(),
      },
    },
  );
}

/**
 * Clean up expired entries from rate limit store periodically
 */
function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
