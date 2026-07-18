'use client';

// The login-gate state machine. Context-provider pattern per the Next.js docs
// (Server and Client Components → "Context providers"): a client component
// wrapping `children`, mounted once near the root (app/layout.tsx) so both the
// (app)-layout gate and the Instellingen "Uitloggen" section can read it.
//
// Hard safety rule: NEXT_PUBLIC_AUTH_REQUIRED unset/not "true" → `status` is
// immediately 'disabled' and nothing else in this file runs — no store read,
// no network call. That's the whole regression contract for the public
// v0.6.2 build and demos.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AuthApiError,
  login as apiLogin,
  logoutSession as apiLogout,
  me as apiMe,
  refreshSession as apiRefresh,
  requestPasswordReset as apiRequestPasswordReset,
  type Account,
  type Entitlement,
} from './auth';
import {
  REFRESH_TOKEN_TTL_MS,
  clearCachedSession,
  readCachedSession,
  writeCachedSession,
  type CachedSession,
} from './authCache';

const AUTH_REQUIRED = process.env.NEXT_PUBLIC_AUTH_REQUIRED === 'true';

// Silent re-refresh while the app sits open — access tokens are short-lived
// (15 min server default), this keeps one alive for any future
// capability-gated call (Phase 3) without asking the user to re-log-in.
const SILENT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export type AuthStatus =
  | 'disabled'
  | 'loading'
  | 'unauthenticated'
  | 'inactive'
  | 'authenticated';

export type LoginErrorCode =
  | 'invalid'
  | 'unverified'
  | 'rate_limited'
  | 'network'
  | 'unknown';

type AuthContextValue = {
  required: boolean;
  status: AuthStatus;
  account: Account | null;
  entitlement: Entitlement | null;
  offline: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; code: LoginErrorCode }>;
  logout: () => Promise<void>;
  requestPasswordReset: (
    email: string,
  ) => Promise<{ ok: true } | { ok: false; code: LoginErrorCode }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function classifyError(e: unknown): LoginErrorCode {
  if (e instanceof AuthApiError) {
    if (e.status === 401) return 'invalid';
    if (e.status === 403) return 'unverified';
    if (e.status === 429) return 'rate_limited';
    return 'unknown';
  }
  return 'network';
}

function statusFor(entitlement: Entitlement | null): AuthStatus {
  return entitlement?.status === 'active' ? 'authenticated' : 'inactive';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    AUTH_REQUIRED ? 'loading' : 'disabled',
  );
  const [account, setAccount] = useState<Account | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [offline, setOffline] = useState(false);
  const accessTokenRef = useRef<string | null>(null);

  const applySession = useCallback(
    async (
      pair: { access_token: string; refresh_token: string },
      cachedFallback: CachedSession,
    ) => {
      accessTokenRef.current = pair.access_token;
      let freshAccount: Account | null = null;
      try {
        freshAccount = await apiMe(pair.access_token);
      } catch {
        // Refresh succeeded but /me failed transiently — degrade to the
        // cached entitlement snapshot rather than bouncing to login.
        freshAccount = null;
      }
      const nextEntitlement = freshAccount?.entitlement ?? cachedFallback.entitlement;
      const nextCache: CachedSession = {
        refreshToken: pair.refresh_token,
        entitlement: nextEntitlement,
        email: freshAccount?.email ?? cachedFallback.email,
        emailVerified: freshAccount?.email_verified ?? cachedFallback.emailVerified,
        validUntil: Date.now() + REFRESH_TOKEN_TTL_MS,
      };
      await writeCachedSession(nextCache);
      setAccount(freshAccount);
      setEntitlement(nextEntitlement);
      setOffline(false);
      setStatus(statusFor(nextEntitlement));
    },
    [],
  );

  const bootstrap = useCallback(async () => {
    const cached = await readCachedSession();
    if (!cached) {
      setStatus('unauthenticated');
      return;
    }

    try {
      const pair = await apiRefresh(cached.refreshToken);
      await applySession(pair, cached);
    } catch (e) {
      if (e instanceof AuthApiError) {
        // The server explicitly rejected the refresh token (revoked/expired)
        // — this is a real "you're logged out", not a connectivity blip.
        await clearCachedSession();
        accessTokenRef.current = null;
        setAccount(null);
        setEntitlement(null);
        setStatus('unauthenticated');
        return;
      }
      // Network failure — the offline path. Trust the cache until its own
      // (sliding) expiry.
      if (cached.validUntil > Date.now()) {
        setAccount(null);
        setEntitlement(cached.entitlement);
        setOffline(true);
        setStatus(statusFor(cached.entitlement));
      } else {
        await clearCachedSession();
        setStatus('unauthenticated');
      }
    }
  }, [applySession]);

  useEffect(() => {
    if (!AUTH_REQUIRED) return;
    let alive = true;
    (async () => {
      await bootstrap();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
  }, [bootstrap]);

  // Periodic silent re-refresh while a session is live. Network failures are
  // swallowed on purpose (offline stays offline, not logged out); only an
  // explicit server rejection forces a re-login.
  useEffect(() => {
    if (!AUTH_REQUIRED) return;
    if (status !== 'authenticated' && status !== 'inactive') return;

    const id = window.setInterval(async () => {
      const cached = await readCachedSession();
      if (!cached) return;
      try {
        const pair = await apiRefresh(cached.refreshToken);
        await applySession(pair, cached);
      } catch (e) {
        if (e instanceof AuthApiError) {
          await clearCachedSession();
          accessTokenRef.current = null;
          setAccount(null);
          setEntitlement(null);
          setStatus('unauthenticated');
        }
        // network error → leave everything as-is, try again next tick
      }
    }, SILENT_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [status, applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const pair = await apiLogin(email, password);
        accessTokenRef.current = pair.access_token;
        const freshAccount = await apiMe(pair.access_token);
        const nextEntitlement = freshAccount.entitlement;
        await writeCachedSession({
          refreshToken: pair.refresh_token,
          entitlement: nextEntitlement,
          email: freshAccount.email,
          emailVerified: freshAccount.email_verified,
          validUntil: Date.now() + REFRESH_TOKEN_TTL_MS,
        });
        setAccount(freshAccount);
        setEntitlement(nextEntitlement);
        setOffline(false);
        setStatus(statusFor(nextEntitlement));
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, code: classifyError(e) };
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    const cached = await readCachedSession();
    if (cached?.refreshToken) {
      try {
        await apiLogout(cached.refreshToken);
      } catch {
        // best-effort server-side revoke — local cache clears regardless
      }
    }
    await clearCachedSession();
    accessTokenRef.current = null;
    setAccount(null);
    setEntitlement(null);
    setOffline(false);
    setStatus('unauthenticated');
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      await apiRequestPasswordReset(email);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, code: classifyError(e) };
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      required: AUTH_REQUIRED,
      status,
      account,
      entitlement,
      offline,
      login,
      logout,
      requestPasswordReset,
    }),
    [status, account, entitlement, offline, login, logout, requestPasswordReset],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
