'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

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
  | { kind: 'installing'; version: string }
  | { kind: 'error'; message: string };

/**
 * Auto-update: checks GitHub Releases once on app start. If a newer version is
 * out, it surfaces a non-intrusive banner ("nu installeren / later") rather than
 * forcing a restart. The manual "Controleer op updates" button in Instellingen
 * stays as a fallback.
 */
export default function AutoUpdate() {
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
    setState({ kind: 'installing', version });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) {
        setState({ kind: 'idle' });
        return;
      }
      await update.downloadAndInstall();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Installeren mislukt.',
      });
    }
  }

  if (!isTauri || dismissed || state.kind === 'idle') return null;

  return (
    <div className="auto-update" role="status">
      {state.kind === 'available' && (
        <>
          <span className="auto-update__text">
            Coeus-update {state.version} beschikbaar.
          </span>
          <button className="btn-primary-sm" onClick={install}>
            Nu installeren
          </button>
          <button className="auto-update__dismiss" onClick={() => setDismissed(true)}>
            Later
          </button>
        </>
      )}
      {state.kind === 'installing' && (
        <span className="auto-update__text">
          Update {state.version} wordt geïnstalleerd — de app herstart zo…
        </span>
      )}
      {state.kind === 'error' && (
        <span className="auto-update__text auto-update__text--error">{state.message}</span>
      )}
    </div>
  );
}
