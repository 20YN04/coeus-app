'use client';

import { useEffect, useState } from 'react';
import {
  getLlmStatus,
  setLlmKey,
  deleteLlmKey,
  waitForBrein,
  type LlmStatus,
} from '@/lib/brein';

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
        message: e instanceof Error ? e.message : 'Status ophalen mislukt.',
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
            message: e instanceof Error ? e.message : 'Status ophalen mislukt.',
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setAction({ kind: 'error', message: 'Plak eerst een sleutel.' });
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
        message: e instanceof Error ? e.message : 'Opslaan mislukt.',
      });
    }
  }

  async function handleDelete() {
    const proceed = window.confirm(
      'Dit verwijdert de lokale AI-sleutel. /ask en AI-extractie werken daarna ' +
        'niet meer tot je een nieuwe sleutel instelt. Doorgaan?',
    );
    if (!proceed) return;
    setAction({ kind: 'busy' });
    try {
      await deleteLlmKey();
      setAction({ kind: 'idle' });
      await refresh();
    } catch (e) {
      setAction({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Verwijderen mislukt.',
      });
    }
  }

  const busy = action.kind === 'busy';
  const configured = load.kind === 'ready' && load.status.configured;
  const provider =
    load.kind === 'ready' && load.status.provider
      ? PROVIDER_LABEL[load.status.provider] ?? load.status.provider
      : null;

  return (
    <section className="settings-section">
      <div className="settings-section__header">
        <p className="settings-section__label">AI</p>
        <p className="settings-section__desc">
          Met een AI-sleutel kan Coeus vragen beantwoorden (<code className="code-inline">Vraag de kennisbank</code>)
          en slimmer kennis uit tekst halen. De sleutel blijft lokaal — opgeslagen
          in de data-map op deze machine, nooit in de app zelf. Normaal stelt
          Ynarchive die in bij oplevering; je hoeft hier dan niets te doen.
        </p>
      </div>

      <div className="data-beheer">
        <div className="data-beheer__action">
          {load.kind === 'loading' && (
            <p className="update-check__status">Status laden…</p>
          )}
          {load.kind === 'error' && (
            <p className="update-check__status update-check__status--error">
              {load.message}
            </p>
          )}
          {load.kind === 'ready' &&
            (configured ? (
              <p className="update-check__status update-check__status--ok">
                AI actief{provider ? ` · ${provider}` : ''}
                {load.status.model ? ` · ${load.status.model}` : ''}
              </p>
            ) : (
              <p className="update-check__status">Geen sleutel ingesteld.</p>
            ))}
        </div>

        <form onSubmit={handleSave} className="data-beheer__action">
          <div className="form-field">
            <label className="form-label" htmlFor="ai-key">
              AI-sleutel
            </label>
            <input
              id="ai-key"
              className="form-input"
              type="password"
              autoComplete="off"
              placeholder="sk-…"
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
              {busy ? 'Opslaan…' : 'Sleutel opslaan'}
            </button>
            {configured && (
              <button
                type="button"
                className="btn-ghost"
                onClick={handleDelete}
                disabled={busy}
              >
                Verwijderen
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
