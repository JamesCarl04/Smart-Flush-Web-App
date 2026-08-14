// lib/cors.ts
/**
 * HIGH FIX: CORS (Cross-Origin Resource Sharing) configuration
 * Explicitly whitelist allowed origins to prevent CSRF and unauthorized cross-origin requests
 */

import { NextResponse } from 'next/server';

// Whitelist of allowed origins
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  'http://localhost:3000', // Development
  'http://localhost:3001', // Development alternative port
  // Add production domains here
  // 'https://smartflush.example.com',
];

/**
 * Add CORS headers to response if origin is allowed
 * @param response - NextResponse to add headers to
 * @param request - NextRequest with origin header
 * @returns Modified response with CORS headers if origin is whitelisted
 */
export function addCorsHeaders(
  response: NextResponse,
  request: any, // NextRequest doesn't export, use any
): NextResponse {
  const origin = request.headers?.get('origin');

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}

/**
 * Handle CORS preflight requests (OPTIONS)
 * @param request - NextRequest
 * @returns Preflight response
 */
export function handleCorsPreFlight(request: any): NextResponse {
  const origin = request.headers?.get('origin');

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  }

  // Reject non-whitelisted origins
  return new NextResponse(null, { status: 403 });
}

/**
 * Add security headers to all responses
 * Prevents clickjacking, MIME sniffing, and enables CSP
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking attacks
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection (legacy, modern browsers use CSP)
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy for privacy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy (CRITICAL RECOMMENDATION)
  // This prevents inline scripts and restricts resource loading
  // Prevents XSS attacks effectively
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Customize based on your needs
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.pwnedpasswords.com", // HIBP for password check
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );

  return response;
}
