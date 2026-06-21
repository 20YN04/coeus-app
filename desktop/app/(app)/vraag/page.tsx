'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ask, waitForBrein, type AskResult } from '@/lib/brein';

type Turn = {
  question: string;
  answer: string;
  bronnen: AskResult['bronnen'];
};

// Het brein geeft 502/503 terug als er geen LLM-key is. De gedeelde req-helper
// gooit dan een Error met de statuscode in de message — herken die zodat we de
// gebruiker naar Instellingen → AI sturen i.p.v. een kale foutmelding te tonen.
function isNoKeyError(message: string): boolean {
  return /\b50[23]\b/.test(message);
}

export default function VraagPage() {
  const [ready, setReady] = useState(false);
  const [breinError, setBreinError] = useState('');

  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [noKey, setNoKey] = useState(false);

  const historyEndRef = useRef<HTMLDivElement | null>(null);

  // Wacht op de lokale brein-sidecar voordat we vragen kunnen stellen.
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    waitForBrein(undefined, ctrl.signal).then((ok) => {
      if (!alive) return;
      setReady(true);
      if (!ok) {
        setBreinError(
          'Brein niet bereikbaar — controleer of de lokale brein draait.',
        );
      }
    });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  // Scroll de nieuwste Q&A in beeld zodra de geschiedenis groeit.
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [history.length, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) {
      setError('Stel eerst een vraag.');
      return;
    }
    setError('');
    setNoKey(false);
    setLoading(true);
    try {
      const res = await ask(q);
      setHistory((prev) => [
        ...prev,
        { question: q, answer: res.antwoord, bronnen: res.bronnen ?? [] },
      ]);
      setQuestion('');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Er ging iets mis bij het vragen.';
      if (isNoKeyError(message)) {
        setNoKey(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Kennisbank</p>
        <h1 className="page-title">Vraag de kennisbank</h1>
      </div>

      <p className="import-intro">
        Stel een vraag in gewone taal. Coeus zoekt de relevante kennis erbij en
        formuleert een antwoord — met de bronnen waarop het zich baseert. Alles
        blijft lokaal.
      </p>

      {breinError && (
        <div className="api-error-banner">
          <span>{breinError}</span>
        </div>
      )}

      {noKey && (
        <div className="api-error-banner">
          <span>
            AI is nog niet geconfigureerd — stel een sleutel in bij{' '}
            <Link href="/instellingen" className="breadcrumb-link">
              Instellingen → AI
            </Link>
            .
          </span>
        </div>
      )}

      {history.length > 0 && (
        <div className="vraag-history">
          {history.map((turn, i) => (
            <div key={i} className="vraag-turn">
              <p className="vraag-turn__question">{turn.question}</p>
              <div className="vraag-turn__answer">{turn.answer}</div>
              {turn.bronnen.length > 0 && (
                <div className="vraag-turn__bronnen">
                  <p className="vraag-turn__bronnen-label">Bronnen</p>
                  <ul className="vraag-bronnen">
                    {turn.bronnen.map((bron, j) =>
                      bron.id ? (
                        <li key={j}>
                          <Link
                            href={`/kennisbank/detail?id=${encodeURIComponent(bron.id)}`}
                            className="vraag-bron"
                          >
                            <span className="vraag-bron__title">{bron.title}</span>
                            <span className="vraag-bron__category">
                              {bron.category}
                            </span>
                          </Link>
                        </li>
                      ) : (
                        <li key={j}>
                          <span className="vraag-bron vraag-bron--static">
                            <span className="vraag-bron__title">{bron.title}</span>
                            <span className="vraag-bron__category">
                              {bron.category}
                            </span>
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}
            </div>
          ))}
          <div ref={historyEndRef} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="vraag-form">
        <div className="form-field">
          <label className="form-label" htmlFor="vraag-input">
            Je vraag
          </label>
          <textarea
            id="vraag-input"
            className="form-input form-textarea"
            placeholder="Bijv. Wat zijn onze openingstijden tijdens de feestdagen?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit(e);
              }
            }}
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !ready}
            aria-busy={loading}
          >
            <span>{loading ? 'Denken…' : 'Vraag stellen'}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </>
  );
}
