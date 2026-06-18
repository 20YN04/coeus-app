// Next 16 Proxy convention: this file is named proxy.ts (not middleware.ts).
// Next 16 compiles proxy.ts into middleware.js internally — verified working at runtime.
// See node_modules/next/dist/docs/.../16-proxy.md. Do NOT rename to middleware.ts.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_KEY = 'coeus_session';
// Public paths must include the auth API routes — otherwise the proxy redirects
// POST /api/login itself to /login and you can never authenticate.
const PUBLIC_PATHS = ['/login', '/api/login', '/api/logout'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(SESSION_KEY);
  if (!cookie || cookie.value !== '1') {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts).*)'],
};
