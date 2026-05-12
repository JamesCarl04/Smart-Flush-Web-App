import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function applyPresentationModeCookie(
  response: NextResponse,
  request: NextRequest,
) {
  const demoParam = request.nextUrl.searchParams.get('demo');

  if (demoParam === '1') {
    response.cookies.set('presentation-mode', '1', {
      path: '/',
      maxAge: 86400,
      sameSite: 'lax',
    });
  } else if (demoParam === '0') {
    response.cookies.set('presentation-mode', '', {
      path: '/',
      maxAge: 0,
      sameSite: 'lax',
    });
  }

  return response;
}

export function proxy(request: NextRequest) {
  // Using a cookie to check auth state because middleware runs on edge
  const token = request.cookies.get('auth-token')?.value;
  const presentationCookie = request.cookies.get('presentation-mode')?.value;
  const { pathname, searchParams } = request.nextUrl;
  const presentationMode =
    searchParams.get('demo') === '1' || presentationCookie === '1';

  const isAuthPage =
    pathname.startsWith('/auth/login') || pathname.startsWith('/auth/register');

  // Pass through Next.js internals only
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico')) {
    return applyPresentationModeCookie(NextResponse.next(), request);
  }

  // Redirect root to dashboard (auth middleware below handles unauthenticated case)
  if (pathname === '/') {
    return applyPresentationModeCookie(
      NextResponse.redirect(
      new URL(
        presentationMode
          ? '/dashboard?demo=1'
          : token
            ? '/dashboard'
            : '/auth/login',
        request.url,
      ),
      ),
      request,
    );
  }

  // Redirect unauthenticated users to /auth/login
  if (
    !token &&
    !presentationMode &&
    !isAuthPage &&
    !pathname.startsWith('/auth/forgot-password')
  ) {
    return applyPresentationModeCookie(
      NextResponse.redirect(new URL('/auth/login', request.url)),
      request,
    );
  }

  // Redirect authenticated users away from /auth/* to /dashboard
  if (token && pathname.startsWith('/auth')) {
    return applyPresentationModeCookie(
      NextResponse.redirect(new URL('/dashboard', request.url)),
      request,
    );
  }

  return applyPresentationModeCookie(NextResponse.next(), request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
