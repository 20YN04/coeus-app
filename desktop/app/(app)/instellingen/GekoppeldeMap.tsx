'use client';

import { useEffect, useState } from 'react';
import {
  getFolder,
  connectFolder,
  rescanFolder,
  disconnectFolder,
  waitForBrein,
  type ConnectorStatus,
  type ConnectorRescanResult,
} from '@/lib/brein';
import { useT, type Lang } from '@/lib/i18n';

type LoadPhase =
  | { kind: 'loading' }
  | { kind: 'ready'; status: ConnectorStatus }
  | { kind: 'error'; message: string };

type ConnectPhase =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string };

type RescanPhase =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; result: ConnectorRescanResult }
  | { kind: 'error'; message: string };

type DisconnectPhase =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string };

function formatDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(lang === 'en' ? 'en-GB' : 'nl-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function GekoppeldeMap() {
  const { t, lang } = useT();
  const [load, setLoad] = useState<LoadPhase>({ kind: 'loading' });
  const [path, setPath] = useState('');
  const [connect, setConnect] = useState<ConnectPhase>({ kind: 'idle' });
  const [rescan, setRescan] = useState<RescanPhase>({ kind: 'idle' });
  const [disconnect, setDisconnect] = useState<DisconnectPhase>({ kind: 'idle' });

  async function refresh() {
    try {
      await waitForBrein();
      const status = await getFolder();
      setLoad({ kind: 'ready', status });
    } catch (e) {
      setLoad({
        kind: 'error',
        message: e instanceof Error ? e.message : t('connector.statusFailed'),
      });
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await waitForBrein();
        const status = await getFolder();
        if (alive) setLoad({ kind: 'ready', status });
      } catch (e) {
        if (alive) {
          setLoad({
            kind: 'error',
            message: e instanceof Error ? e.message : t('connector.statusFailed'),
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) {
      setConnect({ kind: 'error', message: t('connector.errEmptyPath') });
      return;
    }
    setConnect({ kind: 'busy' });
    setRescan({ kind: 'idle' });
    try {
      await connectFolder(trimmed);
      setPath('');
      setConnect({ kind: 'idle' });
      await refresh();
    } catch (e) {
      setConnect({
        kind: 'error',
        message: e instanceof Error ? e.message : t('connector.connectFailed'),
      });
    }
  }

  async function handleRescan() {
    setRescan({ kind: 'busy' });
    try {
      const result = await rescanFolder();
      setRescan({ kind: 'done', result });
      await refresh();
    } catch (e) {
      setRescan({
        kind: 'error',
        message: e instanceof Error ? e.message : t('connector.rescanFailed'),
      });
    }
  }

  async function handleDisconnect() {
    const proceed = window.confirm(t('connector.disconnectConfirm'));
    if (!proceed) return;
    setDisconnect({ kind: 'busy' });
    try {
      await disconnectFolder();
      setDisconnect({ kind: 'idle' });
      setRescan({ kind: 'idle' });
      await refresh();
    } catch (e) {
      setDisconnect({
        kind: 'error',
        message: e instanceof Error ? e.message : t('connector.disconnectFailed'),
      });
    }
  }

  const connectBusy = connect.kind === 'busy';
  const rescanBusy = rescan.kind === 'busy';
  const disconnectBusy = disconnect.kind === 'busy';
  const connected = load.kind === 'ready' && load.status.path != null;

  return (
    <section className="settings-section">
      <div className="settings-section__header">
        <p className="settings-section__label">{t('connector.label')}</p>
        <p className="settings-section__desc">{t('connector.desc')}</p>
      </div>

      <div className="data-beheer">
        <div className="data-beheer__action">
          {load.kind === 'loading' && (
            <p className="update-check__status">{t('connector.statusLoading')}</p>
          )}
          {load.kind === 'error' && (
            <p className="update-check__status update-check__status--error">
              {load.message}
            </p>
          )}
          {load.kind === 'ready' &&
            (connected ? (
              <p className="update-check__status update-check__status--ok">
                {t('connector.connectedLabel')}: {load.status.path}
                {' · '}
                {t('connector.lastScanLabel')}: {formatDate(load.status.laatste_scan, lang)}
                {' · '}
                {t('connector.filesKnown', {
                  files: load.status.bestanden_bekend ?? 0,
                  items: load.status.items ?? 0,
                })}
              </p>
            ) : (
              <p className="update-check__status">{t('connector.notConnected')}</p>
            ))}
        </div>

        {!connected && (
          <form onSubmit={handleConnect} className="data-beheer__action">
            <div className="form-field">
              <label className="form-label" htmlFor="connector-path">
                {t('connector.pathLabel')}
              </label>
              {/* TODO: native map-picker (Tauri dialog-plugin) i.p.v. tekstveld — v1 doet tekst-invoer. */}
              <input
                id="connector-path"
                className="form-input"
                type="text"
                autoComplete="off"
                placeholder={t('connector.pathPlaceholder')}
                value={path}
                onChange={(ev) => setPath(ev.target.value)}
              />
            </div>

            {connect.kind === 'error' && (
              <p className="update-check__status update-check__status--error">
                {connect.message}
              </p>
            )}

            <div className="form-actions">
              <button
                type="submit"
                className="btn-outline"
                disabled={connectBusy}
                aria-busy={connectBusy}
              >
                {connectBusy ? t('connector.connecting') : t('connector.connectBtn')}
              </button>
            </div>
          </form>
        )}

        {connected && (
          <div className="data-beheer__action">
            <div className="form-actions">
              <button
                type="button"
                className="btn-outline"
                onClick={handleRescan}
                disabled={rescanBusy}
                aria-busy={rescanBusy}
              >
                {rescanBusy ? t('connector.rescanning') : t('connector.rescanBtn')}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={handleDisconnect}
                disabled={disconnectBusy}
              >
                {disconnectBusy ? t('connector.disconnecting') : t('connector.disconnectBtn')}
              </button>
            </div>

            {rescan.kind === 'done' && (
              <p className="update-check__status update-check__status--ok">
                {t('connector.rescanResult', {
                  nieuw: rescan.result.nieuw,
                  gewijzigd: rescan.result.gewijzigd,
                  verwijderd: rescan.result.verwijderd,
                  items: rescan.result.items_toegevoegd + rescan.result.items_verwijderd,
                })}
              </p>
            )}
            {rescan.kind === 'error' && (
              <p className="update-check__status update-check__status--error">
                {rescan.message}
              </p>
            )}
            {disconnect.kind === 'error' && (
              <p className="update-check__status update-check__status--error">
                {disconnect.message}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
