import { NextRequest, NextResponse } from 'next/server';

const SESSION_KEY = 'coeus_session';
const SESSION_MAX_AGE = 60 * 60 * 8;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body as { email?: string; password?: string };

  const demoEmail = process.env.DEMO_EMAIL ?? 'demo@coeus.app';
  const demoPassword = process.env.DEMO_PASSWORD ?? 'coeus2024';

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    email.trim() !== demoEmail ||
    password !== demoPassword
  ) {
    return NextResponse.json({ error: 'Ongeldig e-mailadres of wachtwoord.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_KEY, '1', {
    httpOnly: true,
    path: '/',
    maxAge: SESSION_MAX_AGE,
    sameSite: 'lax',
  });
  return res;
}
