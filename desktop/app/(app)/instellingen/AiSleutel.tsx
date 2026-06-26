'use client';

import { useEffect, useState } from 'react';
import {
  getLlmStatus,
  setLlmKey,
  deleteLlmKey,
  waitForBrein,
  type LlmStatus,
} from '@/lib/brein';
import { useT } from '@/lib/i18n';

type LoadPhase =
  | { kind: 'loading' }
  | { kind: 'ready'; status: LlmStatus }
  | { kind: 'error'; message: string };

type ActionPhase =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string };

const PROVIDER_LABEL: Record<string, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
};

export default function AiSleutel() {
  const { t } = useT();
  const [load, setLoad] = useState<LoadPhase>({ kind: 'loading' });
  const [action, setAction] = useState<ActionPhase>({ kind: 'idle' });
  const [key, setKey] = useState('');

  async function refresh() {
    setLoad({ kind: 'loading' });
    try {
      await waitForBrein();
      const status = await getLlmStatus();
      setLoad({ kind: 'ready', status });
    } catch (e) {
      setLoad({
        kind: 'error',
        message: e instanceof Error ? e.message : t('instellingen.ai.statusFailed'),
      });
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await waitForBrein();
        const status = await getLlmStatus();
        if (alive) setLoad({ kind: 'ready', status });
      } catch (e) {
        if (alive) {
          setLoad({
            kind: 'error',
            message: e instanceof Error ? e.message : t('instellingen.ai.statusFailed'),
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setAction({ kind: 'error', message: t('instellingen.ai.errPasteKey') });
      return;
    }
    setAction({ kind: 'busy' });
    try {
      await setLlmKey(trimmed);
      setKey('');
      setAction({ kind: 'idle' });
      await refresh();
    } catch (e) {
      setAction({
        kind: 'error',
        message: e instanceof Error ? e.message : t('errors.saveFailed'),
      });
    }
  }

  async function handleDelete() {
    const proceed = window.confirm(t('instellingen.ai.deleteConfirm'));
    if (!proceed) return;
    setAction({ kind: 'busy' });
    try {
      await deleteLlmKey();
      setAction({ kind: 'idle' });
      await refresh();
    } catch (e) {
      setAction({
        kind: 'error',
        message: e instanceof Error ? e.message : t('errors.deleteFailed'),
      });
    }
  }

  const busy = action.kind === 'busy';
  const configured = load.kind === 'ready' && load.status.configured;
  const provider =
    load.kind === 'ready' && load.status.provider
      ? PROVIDER_LABEL[load.status.provider] ?? load.status.provider
      : null;

  const descParts = t('instellingen.ai.desc').split('Vraag de kennisbank');

  return (
    <section className="settings-section">
      <div className="settings-section__header">
        <p className="settings-section__label">{t('instellingen.ai.label')}</p>
        <p className="settings-section__desc">
          {descParts[0]}
          <code className="code-inline">{t('vraag.title')}</code>
          {descParts[1]}
        </p>
      </div>

      <div className="data-beheer">
        <div className="data-beheer__action">
          {load.kind === 'loading' && (
            <p className="update-check__status">{t('instellingen.ai.statusLoading')}</p>
          )}
          {load.kind === 'error' && (
            <p className="update-check__status update-check__status--error">
              {load.message}
            </p>
          )}
          {load.kind === 'ready' &&
            (configured ? (
              <p className="update-check__status update-check__status--ok">
                {t('instellingen.ai.statusActive')}{provider ? ` · ${provider}` : ''}
                {load.status.model ? ` · ${load.status.model}` : ''}
              </p>
            ) : (
              <p className="update-check__status">{t('instellingen.ai.statusNoKey')}</p>
            ))}
        </div>

        <form onSubmit={handleSave} className="data-beheer__action">
          <div className="form-field">
            <label className="form-label" htmlFor="ai-key">
              {t('instellingen.ai.keyLabel')}
            </label>
            <input
              id="ai-key"
              className="form-input"
              type="password"
              autoComplete="off"
              placeholder={t('instellingen.ai.keyPlaceholder')}
              value={key}
              onChange={(ev) => setKey(ev.target.value)}
            />
          </div>

          {action.kind === 'error' && (
            <p className="update-check__status update-check__status--error">
              {action.message}
            </p>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="btn-outline"
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? t('common.saving') : t('instellingen.ai.saveKey')}
            </button>
            {configured && (
              <button
                type="button"
                className="btn-ghost"
                onClick={handleDelete}
                disabled={busy}
              >
                {t('common.delete')}
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
