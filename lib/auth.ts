const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? 'demo@coeus.app';
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? 'coeus2024';
const SESSION_KEY = 'coeus_session';

export function validateCredentials(email: string, password: string): boolean {
  return email === DEMO_EMAIL && password === DEMO_PASSWORD;
}

export function setSession(): void {
  document.cookie = `${SESSION_KEY}=1; path=/; max-age=${60 * 60 * 8}; SameSite=Lax`;
}

export function clearSession(): void {
  document.cookie = `${SESSION_KEY}=; path=/; max-age=0`;
}

export function hasSession(cookieHeader?: string): boolean {
  const src = cookieHeader ?? (typeof document !== 'undefined' ? document.cookie : '');
  return src.split(';').some((c) => c.trim().startsWith(`${SESSION_KEY}=1`));
}
