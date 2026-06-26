'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import tenant from '@/config/tenant';
import { dictionaries, type Lang } from './dictionary';

export type { Lang } from './dictionary';

const STORAGE_KEY = 'coeus.lang';

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLang(): Lang | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'nl' || stored === 'en' ? stored : null;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Server/SSG snapshot and the first client render both use the tenant
  // default — the stored preference (if any) is applied post-mount via the
  // lazy initializer below, which React still treats as the first render but
  // only runs in the browser, so prerender output never depends on it.
  const [lang, setLangState] = useState<Lang>(() => readStoredLang() ?? tenant.defaultLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

function getPath(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useT must be used within an I18nProvider');
  }
  const { lang, setLang } = ctx;

  const t = useCallback(
    (key: string, vars?: Vars): string => {
      const path = key.split('.');
      const value =
        getPath(dictionaries[lang], path) ?? getPath(dictionaries.nl, path);
      if (typeof value !== 'string') return key;
      return interpolate(value, vars);
    },
    [lang],
  );

  // For dictionary entries that are arrays/objects rather than strings
  // (e.g. home.chips, automatisaties.items) — no interpolation applies.
  const tList = useCallback(
    <T,>(key: string): T => {
      const path = key.split('.');
      const value =
        getPath(dictionaries[lang], path) ?? getPath(dictionaries.nl, path);
      return value as T;
    },
    [lang],
  );

  return { t, tList, lang, setLang };
}
