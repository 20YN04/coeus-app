// coeus-auth client. Talks to the standalone auth service (separate origin
// from the local brein sidecar) — see ~/Projects/coeus-auth. Endpoints per
// app/routers/auth.py there: /login /refresh /logout /me /password/reset-request.
//
// Gate lives behind NEXT_PUBLIC_AUTH_REQUIRED (see lib/authContext.tsx) — this
// module itself has no gate awareness, it's just the transport.
const AUTH_URL =
  process.env.NEXT_PUBLIC_AUTH_URL ?? 'https://auth.coeus.ynarchive.com';

export type EntitlementStatus = 'active' | 'none' | 'canceled';

// Phase 1 shape is a single status; the prijsmodel decision (2026-07-18) will
// widen this to per-capability flags (`platform` / `ai` / automation modules)
// in Phase 3 without changing the field name — consumers should read
// `entitlement.status` for the coarse gate and leave room for a future
// `entitlement.capabilities` alongside it.
export type Entitlement = {
  product: string;
  status: EntitlementStatus;
  stripe_customer_id?: string | null;
  current_period_end?: string | null;
};

export type Account = {
  id: string;
  email: string;
  email_verified: boolean;
  created_at: string;
  entitlement: Entitlement | null;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export class AuthApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
  }
}

async function authReq<T>(
  path: string,
  init?: RequestInit,
  accessToken?: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    // No response at all — offline / DNS / connection refused. Distinct from
    // AuthApiError so callers can tell "server said no" from "couldn't reach
    // the server" (the latter is the offline path the whole cache exists for).
    throw new TypeError(
      e instanceof Error ? e.message : 'auth-netwerkfout',
    );
  }

  const isJson = res.headers
    .get('content-type')
    ?.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail?: unknown }).detail)
        : res.statusText;
    throw new AuthApiError(res.status, detail || `HTTP ${res.status}`);
  }
  return body as T;
}

export async function login(
  email: string,
  password: string,
): Promise<TokenPair> {
  return authReq<TokenPair>('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function refreshSession(
  refreshToken: string,
): Promise<TokenPair> {
  return authReq<TokenPair>('/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export async function logoutSession(refreshToken: string): Promise<void> {
  await authReq<{ detail: string }>('/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export async function me(accessToken: string): Promise<Account> {
  return authReq<Account>('/me', { method: 'GET' }, accessToken);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await authReq<{ detail: string }>('/password/reset-request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}
