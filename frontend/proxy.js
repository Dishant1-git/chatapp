import { NextResponse } from 'next/server';

// Runs before pages load. It only checks whether the login cookie exists —
// the backend is the one that verifies it. If the cookie turns out to be
// invalid, the chat page logs the user out (see ChatProvider).
export function proxy(request) {
  const { pathname } = request.nextUrl;
  const hasToken = Boolean(request.cookies.get('token')?.value);
  const isAuthPage = pathname === '/login' || pathname === '/register';

  if (!hasToken && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (hasToken && (isAuthPage || pathname === '/')) {
    return NextResponse.redirect(new URL('/chat', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/register', '/chat/:path*'],
};
