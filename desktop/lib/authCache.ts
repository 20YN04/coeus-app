// Offline-token cache — the USP-preserving half of the auth gate (see
// coeus-accounts-architectuur.md "Offline-token"). Refresh-token + last-known
// entitlement + a sliding refresh-expiry live in the Tauri app-data dir via
// @tauri-apps/plugin-store (JSON file under app_data_dir, per its docs:
// https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/store/README.md).
// The access token never touches disk — it stays in memory only (lib/authContext.tsx).
//
// Guarded via isTauri() so importing this module is a no-op in a plain
// browser context (e.g. `next dev` outside the Tauri shell, or the
// browser-verify scan) — the static export must not break there.
import { isTauri } from '@tauri-apps/api/core';
import type { Entitlement } from './auth';

const STORE_FILE = 'coeus-auth.json';
const SESSION_KEY = 'session';

export type CachedSession = {
  refreshToken: string;
  entitlement: Entitlement | null;
  email: string;
  emailVerified: boolean;
  // Epoch ms. Reset to now + REFRESH_TOKEN_TTL_MS on every successful
  // login/refresh — mirrors the server, which mints a fresh 60d refresh
  // token on every /refresh call (app/routers/auth.py, coeus-auth). Opaque
  // refresh tokens carry no readable expiry client-side, so this is the
  // client's own bound on the offline grace window.
  validUntil: number;
};

// Matches Settings.refresh_token_ttl_days default in coeus-auth/app/config.py.
export const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

type StoreLike = {
  get<T>(key: string): Promise<T | null | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  save(): Promise<void>;
};

let storePromise: Promise<StoreLike | null> | null = null;

async function getStore(): Promise<StoreLike | null> {
  if (!isTauri()) return null;
  if (!storePromise) {
    storePromise = import('@tauri-apps/plugin-store')
      .then(({ Store }) => Store.load(STORE_FILE) as unknown as StoreLike)
      .catch((e) => {
        console.error('[auth] kon Tauri store niet laden', e);
        return null;
      });
  }
  return storePromise;
}

export async function readCachedSession(): Promise<CachedSession | null> {
  const store = await getStore();
  if (!store) return null;
  const value = await store.get<CachedSession>(SESSION_KEY);
  return value ?? null;
}

export async function writeCachedSession(
  session: CachedSession,
): Promise<void> {
  const store = await getStore();
  if (!store) return;
  await store.set(SESSION_KEY, session);
  await store.save();
}

export async function clearCachedSession(): Promise<void> {
  const store = await getStore();
  if (!store) return;
  await store.delete(SESSION_KEY);
  await store.save();
}
