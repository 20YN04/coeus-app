const SESSION_KEY = 'coeus_session';

export async function loginWithCredentials(email: string, password: string): Promise<void> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Aanmelden mislukt.');
  }
}

export async function logoutSession(): Promise<void> {
  await fetch('/api/logout', { method: 'POST' });
}

export function hasSession(cookieHeader?: string): boolean {
  const src = cookieHeader ?? (typeof document !== 'undefined' ? document.cookie : '');
  return src.split(';').some((c) => c.trim().startsWith(`${SESSION_KEY}=1`));
}
