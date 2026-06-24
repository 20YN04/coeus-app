'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ask, waitForBrein, type AskResult } from '@/lib/brein';

const BREIN_URL = process.env.NEXT_PUBLIC_BREIN_URL ?? 'http://127.0.0.1:8765';

const VOORBEELDVRAGEN = [
  'Wat zijn de openingsuren?',
  'Welke diensten bieden jullie aan?',
  'Hoe vraag ik een offerte aan?',
  'Wat is ons annuleringsbeleid?',
  'Wie is de contactpersoon voor leveranciers?',
];

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

export default function HomePage() {
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
          `Brein niet bereikbaar — controleer of de lokale brein draait op ${BREIN_URL}.`,
        );
      }
    });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  // Scroll het nieuwste antwoord in beeld zodra de geschiedenis groeit.
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [history.length, loading]);

  async function submitQuestion(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      setError('Stel eerst een vraag.');
      return;
    }
    setError('');
    setNoKey(false);
    setLoading(true);
    try {
      const res = await ask(trimmed);
      setHistory((prev) => [
        ...prev,
        { question: trimmed, answer: res.antwoord, bronnen: res.bronnen ?? [] },
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitQuestion(question);
  }

  function handleChip(vraag: string) {
    setQuestion(vraag);
    submitQuestion(vraag);
  }

  return (
    <div className="home">
      <div className="home-hero">
        <p className="home-hero__eyebrow">Coeus</p>
        <h1 className="home-hero__title">Wat wil je weten?</h1>
        <p className="home-hero__sub">
          Stel een vraag in gewone taal. Coeus zoekt het op in jullie kennisbank
          en geeft antwoord — met de bronnen erbij.
        </p>
      </div>

      {breinError && (
        <div className="api-error-banner">
          <span>{breinError}</span>
        </div>
      )}

      {noKey && (
        <div className="api-error-banner">
          <span>
            AI is nog niet ingesteld — voeg een sleutel toe bij{' '}
            <Link href="/instellingen" className="breadcrumb-link">
              Instellingen → AI
            </Link>
            .
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="ask-form">
        <div className="ask-box">
          <textarea
            className="ask-box__input"
            placeholder="Bijv. Wat zijn onze openingstijden tijdens de feestdagen?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit(e);
              }
            }}
          />
          <button
            type="submit"
            className="ask-box__submit"
            disabled={loading || !ready}
            aria-busy={loading}
            aria-label="Vraag stellen"
          >
            {loading ? (
              <span className="ask-box__spinner" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>

      {history.length === 0 && (
        <div className="ask-chips">
          {VOORBEELDVRAGEN.map((vraag) => (
            <button
              key={vraag}
              type="button"
              className="ask-chip"
              onClick={() => handleChip(vraag)}
              disabled={loading || !ready}
            >
              {vraag}
            </button>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="ask-history">
          {history.map((turn, i) => (
            <div key={i} className="ask-turn">
              <p className="ask-turn__question">{turn.question}</p>
              <div className="ask-turn__answer">{turn.answer}</div>
              {turn.bronnen.length > 0 && (
                <div className="ask-turn__bronnen">
                  <p className="ask-turn__bronnen-label">Bronnen</p>
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

      <p className="home-footline">
        Liever bladeren?{' '}
        <Link href="/kennisbank" className="breadcrumb-link">
          Open de kennisbank →
        </Link>
      </p>
    </div>
  );
}
