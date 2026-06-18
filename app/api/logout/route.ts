import { NextResponse } from 'next/server';

const SESSION_KEY = 'coeus_session';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_KEY, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
  });
  return res;
}
