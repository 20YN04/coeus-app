'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useT, type Lang } from '@/lib/i18n';

type BackupInfo = {
  name: string;
  created_ms: number;
  size_bytes: number;
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; name: string }
  | { kind: 'error'; message: string };

/**
 * Runtime guard, mirroring UpdateCheck: the same bundle ships as a Tauri desktop
 * app and as a plain static export. The backup commands only exist inside the
 * desktop webview, so we (a) lazy-import `@tauri-apps/api/core`'s `invoke` inside
 * handlers — never at module scope, so `next build` prerender never evaluates it —
 * and (b) gate the whole section on this check at runtime.
 */
function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const noopSubscribe = () => () => {};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(ms: number, lang: Lang): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(lang === 'en' ? 'en-GB' : 'nl-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BackupBeheer() {
  const { t, lang } = useT();
  const isTauri = useSyncExternalStore(noopSubscribe, inTauri, () => false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [openError, setOpenError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!inTauri()) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const list = await invoke<BackupInfo[]>('list_backups');
      setBackups(list);
    } catch (e) {
      setPhase({
        kind: 'error',
        message: e instanceof Error ? e.message : t('instellingen.backup.loadFailed'),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    // Async load: every setState here runs after an await, so it never fires
    // synchronously within the effect body.
    (async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        const list = await invoke<BackupInfo[]>('list_backups');
        if (!cancelled) setBackups(list);
      } catch (e) {
        if (!cancelled) {
          setPhase({
            kind: 'error',
            message: e instanceof Error ? e.message : t('instellingen.backup.loadFailed'),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTauri]);

  async function handleBackupNow() {
    if (!inTauri()) return;
    setPhase({ kind: 'busy' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const name = await invoke<string>('backup_now');
      setPhase({ kind: 'done', name });
      await refresh();
    } catch (e) {
      setPhase({
        kind: 'error',
        message: e instanceof Error ? e.message : t('instellingen.backup.failed'),
      });
    }
  }

  async function handleOpenDir() {
    if (!inTauri()) return;
    setOpenError(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_backups_dir');
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : t('instellingen.backup.openDirFailed'));
    }
  }

  // Web/SSG build: the desktop-only backup has no meaning, so hide the section.
  if (!isTauri) return null;

  const busy = phase.kind === 'busy';

  return (
    <section className="settings-section">
      <div className="settings-section__header">
        <p className="settings-section__label">{t('instellingen.backup.label')}</p>
        <p className="settings-section__desc">{t('instellingen.backup.desc')}</p>
      </div>

      <div className="backup-beheer">
        <div className="backup-beheer__actions">
          <button
            className="btn-outline"
            onClick={handleBackupNow}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? t('instellingen.backup.backingUp') : t('instellingen.backup.backupNow')}
          </button>
          <button className="btn-outline" onClick={handleOpenDir}>
            {t('instellingen.backup.openDir')}
          </button>
        </div>

        {phase.kind === 'done' && (
          <p className="update-check__status update-check__status--ok">
            {t('instellingen.backup.done')}
          </p>
        )}
        {phase.kind === 'error' && (
          <p className="update-check__status update-check__status--error">
            {phase.message}
          </p>
        )}
        {openError && (
          <p className="update-check__status update-check__status--error">
            {openError}
          </p>
        )}

        {backups.length === 0 ? (
          <p className="backup-beheer__empty">{t('instellingen.backup.empty')}</p>
        ) : (
          <ul className="backup-list">
            {backups.map((b) => (
              <li key={b.name} className="backup-list__row">
                <span className="backup-list__name">{b.name}</span>
                <span className="backup-list__meta">{formatDate(b.created_ms, lang)}</span>
                <span className="backup-list__meta">{formatBytes(b.size_bytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
