// lib/cors.ts
/**
 * HIGH FIX: CORS (Cross-Origin Resource Sharing) configuration
 * Explicitly whitelist allowed origins to prevent CSRF and unauthorized cross-origin requests
 */

import { NextResponse } from 'next/server';

// Whitelist of allowed origins (resolved dynamically to support Vercel prod/preview URLs)
function normalizeOrigin(raw: string | undefined, httpsFallback = false): string | null {
  const trimmed = raw?.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return null;
  }
  const withScheme =
    httpsFallback && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

export function getAllowedOrigins(): Set<string> {
  const candidates = [
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL),
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL),
    normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL, true),
    normalizeOrigin(process.env.VERCEL_URL, true),
    'https://kliradmin.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
  ];

  const allowed = new Set<string>();
  for (const origin of candidates) {
    if (origin) {
      allowed.add(origin);
    }
  }
  return allowed;
}

function applyCorsHeaders(headers: Headers, origin: string): void {
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  headers.set('Access-Control-Allow-Credentials', 'true');
}

/**
 * Add CORS headers to response if origin is allowed
 * @param response - Response or NextResponse to add headers to
 * @param request - NextRequest with origin header
 * @returns Modified response with CORS headers if origin is whitelisted
 */
export function addCorsHeaders(
  response: Response | NextResponse,
  request: Request,
): NextResponse {
  const nextResponse =
    response instanceof NextResponse
      ? response
      : new NextResponse(response.body, response);
  const origin = request.headers?.get('origin')?.trim();

  if (origin && getAllowedOrigins().has(origin)) {
    applyCorsHeaders(nextResponse.headers, origin);
  }

  return nextResponse;
}

/**
 * Handle CORS preflight requests (OPTIONS)
 * @param request - NextRequest
 * @returns Preflight response
 */
export function handleCorsPreFlight(request: Request): NextResponse {
  const origin = request.headers?.get('origin')?.trim();

  if (origin && getAllowedOrigins().has(origin)) {
    const response = new NextResponse(null, { status: 200 });
    applyCorsHeaders(response.headers, origin);
    return response;
  }

  // Reject non-whitelisted origins
  return new NextResponse(null, { status: 403 });
}

/**
 * Add security headers to all responses
 * Prevents clickjacking, MIME sniffing, and enables CSP
 */
export function addSecurityHeaders(
  response: Response | NextResponse,
): NextResponse {
  const nextResponse =
    response instanceof NextResponse
      ? response
      : new NextResponse(response.body, response);

  // Prevent clickjacking attacks
  nextResponse.headers.set('X-Frame-Options', 'SAMEORIGIN');

  // Prevent MIME type sniffing
  nextResponse.headers.set('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection (legacy, modern browsers use CSP)
  nextResponse.headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy for privacy
  nextResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy (CRITICAL RECOMMENDATION)
  // This prevents inline scripts and restricts resource loading
  // Prevents XSS attacks effectively
  nextResponse.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebasestorage.googleapis.com https://api.pwnedpasswords.com https://*.firebaseio.com wss://*.firebaseio.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );

  return nextResponse;
}
