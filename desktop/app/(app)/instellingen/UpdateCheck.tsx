'use client';

import { useState, useSyncExternalStore } from 'react';
import { useT } from '@/lib/i18n';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'uptodate' }
  | { kind: 'installing'; version: string }
  | { kind: 'done'; version: string }
  | { kind: 'error'; message: string };

/**
 * Runtime guard: the same bundle is shipped both as a Tauri desktop app and as a
 * plain static export (web/SSG). The Tauri plugins only exist inside the desktop
 * webview, so we both (a) lazy-import them inside the handler — never at module
 * scope, so `next build` prerender never evaluates them — and (b) gate the button
 * on this check at runtime.
 */
function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// A never-changing external store: lets us read the Tauri-context flag after
// hydration (client snapshot) while the server snapshot stays `false`, so SSG
// prerender and first client render agree — no hydration mismatch, no setState
// in an effect.
const noopSubscribe = () => () => {};

export default function UpdateCheck() {
  const { t } = useT();
  const isTauri = useSyncExternalStore(noopSubscribe, inTauri, () => false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  async function handleCheck() {
    if (!inTauri()) return;
    setPhase({ kind: 'checking' });
    try {
      // Lazy-load so the static build never pulls Tauri APIs into the prerender.
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (!update) {
        setPhase({ kind: 'uptodate' });
        return;
      }

      const version = update.version;
      setPhase({ kind: 'installing', version });
      await update.downloadAndInstall();

      const { relaunch } = await import('@tauri-apps/plugin-process');
      setPhase({ kind: 'done', version });
      await relaunch();
    } catch (e) {
      setPhase({
        kind: 'error',
        message: e instanceof Error ? e.message : t('instellingen.update.checkFailed'),
      });
    }
  }

  // Web/SSG build: the desktop-only updater has no meaning, so hide the control.
  if (!isTauri) return null;

  const busy = phase.kind === 'checking' || phase.kind === 'installing';

  return (
    <div className="update-check">
      <button
        className="btn-outline"
        onClick={handleCheck}
        disabled={busy}
        aria-busy={busy}
      >
        {phase.kind === 'checking'
          ? t('instellingen.update.checking')
          : phase.kind === 'installing'
            ? t('instellingen.update.installing')
            : t('instellingen.update.check')}
      </button>

      {phase.kind === 'uptodate' && (
        <p className="update-check__status update-check__status--ok">
          {t('instellingen.update.uptodate')}
        </p>
      )}
      {phase.kind === 'installing' && (
        <p className="update-check__status">
          {t('instellingen.update.availableInstalling', { version: phase.version })}
        </p>
      )}
      {phase.kind === 'done' && (
        <p className="update-check__status update-check__status--ok">
          {t('instellingen.update.installed', { version: phase.version })}
        </p>
      )}
      {phase.kind === 'error' && (
        <p className="update-check__status update-check__status--error">
          {phase.message}
        </p>
      )}
    </div>
  );
}
