'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useT } from '@/lib/i18n';

// Same Tauri-context guard as UpdateCheck: this only does anything inside the
// desktop webview. The plain static/web build renders nothing and never pulls in
// the Tauri plugins (they're lazy-imported inside handlers, not at module scope).
function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
const noopSubscribe = () => () => {};

type State =
  | { kind: 'idle' }
  | { kind: 'available'; version: string }
  | { kind: 'installing'; version: string; phase: 'downloading'; downloaded: number; total: number | null }
  | { kind: 'installing'; version: string; phase: 'finishing' }
  | { kind: 'error'; message: string };

/**
 * Auto-update: checks GitHub Releases once on app start. If a newer version is
 * out, it surfaces a non-intrusive banner ("nu installeren / later") rather than
 * forcing a restart. The manual "Controleer op updates" button in Instellingen
 * stays as a fallback.
 */
export default function AutoUpdate() {
  const { t } = useT();
  const isTauri = useSyncExternalStore(noopSubscribe, inTauri, () => false);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!inTauri()) return;
    let alive = true;
    (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (alive && update) setState({ kind: 'available', version: update.version });
      } catch {
        // Silent on startup — a failed update check shouldn't nag the user.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function install() {
    if (state.kind !== 'available') return;
    const version = state.version;
    setState({ kind: 'installing', version, phase: 'downloading', downloaded: 0, total: null });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) {
        setState({ kind: 'idle' });
        return;
      }
      // downloadAndInstall's callback fires Started (once, with the total size
      // if the server sent Content-Length) → Progress (many, chunk-by-chunk) →
      // Finished. Track the running total in closure vars (not state) so each
      // Progress tick doesn't read stale state, then push one setState per tick.
      let downloaded = 0;
      let total: number | null = null;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null;
          downloaded = 0;
          setState({ kind: 'installing', version, phase: 'downloading', downloaded, total });
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          setState({ kind: 'installing', version, phase: 'downloading', downloaded, total });
        } else if (event.event === 'Finished') {
          setState({ kind: 'installing', version, phase: 'finishing' });
        }
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : t('instellingen.update.banner.installFailed'),
      });
    }
  }

  if (!isTauri || dismissed || state.kind === 'idle') return null;

  // Unknown contentLength (some CDNs/proxies drop it) → percent stays null,
  // the bar falls back to the indeterminate sweep instead of a stuck 0%.
  const downloading = state.kind === 'installing' && state.phase === 'downloading' ? state : null;
  const percent = downloading?.total ? Math.min(100, Math.round((downloading.downloaded / downloading.total) * 100)) : null;
  const ratio = downloading?.total ? Math.min(1, downloading.downloaded / downloading.total) : 0;

  return (
    <div className="auto-update" role="status">
      {state.kind === 'available' && (
        <>
          <span className="auto-update__text">
            {t('instellingen.update.banner.available', { version: state.version })}
          </span>
          <button className="btn-primary-sm" onClick={install}>
            {t('instellingen.update.banner.installNow')}
          </button>
          <button className="auto-update__dismiss" onClick={() => setDismissed(true)}>
            {t('instellingen.update.banner.later')}
          </button>
        </>
      )}

      {downloading && (
        <div className="auto-update__progress">
          <span className="auto-update__text">
            {percent !== null
              ? t('instellingen.update.banner.downloading', { version: downloading.version, percent })
              : t('instellingen.update.banner.downloadingUnknown', { version: downloading.version })}
          </span>
          <div className="auto-update__progress-track">
            <div
              className={`auto-update__progress-bar${percent === null ? ' auto-update__progress-bar--indeterminate' : ''}`}
              style={percent !== null ? { transform: `scaleX(${ratio})` } : undefined}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
            />
          </div>
        </div>
      )}

      {state.kind === 'installing' && state.phase === 'finishing' && (
        <span className="auto-update__text">
          {t('instellingen.update.banner.installingRestart')}
        </span>
      )}

      {state.kind === 'error' && (
        <span className="auto-update__text auto-update__text--error">{state.message}</span>
      )}
    </div>
  );
}
