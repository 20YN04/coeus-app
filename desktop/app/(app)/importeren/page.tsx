'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ingestText, ingestUrl, waitForBrein } from '@/lib/brein';

type Mode = 'tekst' | 'website';

export default function ImporterenPage() {
  const [mode, setMode] = useState<Mode>('tekst');
  const [ready, setReady] = useState(false);
  const [breinError, setBreinError] = useState('');

  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<number | null>(null);

  // Wacht op de lokale brein-sidecar voordat we kunnen importeren.
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    waitForBrein(undefined, ctrl.signal).then((ok) => {
      if (!alive) return;
      setReady(true);
      if (!ok) setBreinError('Brein niet bereikbaar — controleer of de lokale brein draait.');
    });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setResult(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);

    const cat = category.trim() || undefined;

    if (mode === 'tekst') {
      if (!text.trim()) {
        setError('Plak eerst wat tekst om te importeren.');
        return;
      }
    } else if (!url.trim()) {
      setError('Vul een website-URL in.');
      return;
    }

    setLoading(true);
    try {
      const res =
        mode === 'tekst'
          ? await ingestText(text.trim(), { category: cat })
          : await ingestUrl(url.trim(), { category: cat });
      setResult(res.toegevoegd);
      if (mode === 'tekst') setText('');
      else setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis bij het importeren.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Kennisbank</p>
        <h1 className="page-title">Importeren</h1>
      </div>

      <p className="import-intro">
        Vul de kennisbank zonder handmatig te typen. Plak een lap tekst of geef een
        website-URL op — Coeus hakt het in zinnige stukken en bewaart elk stuk als
        kennis-item. Geen AI-sleutel nodig.
      </p>

      <div className="kb-filters" role="tablist" aria-label="Importmodus">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'tekst'}
          className="filter-chip"
          data-active={mode === 'tekst' ? 'true' : undefined}
          onClick={() => switchMode('tekst')}
        >
          Plak tekst
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'website'}
          className="filter-chip"
          data-active={mode === 'website' ? 'true' : undefined}
          onClick={() => switchMode('website')}
        >
          Vanaf website
        </button>
      </div>

      {breinError && (
        <div className="api-error-banner">
          <span>{breinError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="kennis-form">
        {mode === 'tekst' ? (
          <div className="form-field">
            <label className="form-label" htmlFor="im-text">
              Tekst <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="im-text"
              className="form-input form-textarea"
              placeholder="Plak hier een document, notities, een handleiding…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={14}
            />
          </div>
        ) : (
          <div className="form-field">
            <label className="form-label" htmlFor="im-url">
              Website-URL <span aria-hidden="true">*</span>
            </label>
            <input
              id="im-url"
              className="form-input"
              type="url"
              inputMode="url"
              placeholder="https://voorbeeld.be/over-ons"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        )}

        <div className="form-field">
          <label className="form-label" htmlFor="im-category">
            Categorie <span className="import-optional">— optioneel</span>
          </label>
          <input
            id="im-category"
            className="form-input"
            type="text"
            placeholder="Bijv. procedures, producten, hr…"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        {result !== null && (
          <div className="import-result">
            <p className="import-result__count">
              {result} {result === 1 ? 'item toegevoegd' : 'items toegevoegd'}
            </p>
            <Link href="/kennisbank" className="btn-ghost-sm">
              Bekijk in kennisbank →
            </Link>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={loading || !ready}>
            <span>
              {loading
                ? 'Importeren…'
                : mode === 'tekst'
                  ? 'Tekst importeren'
                  : 'Website importeren'}
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </>
  );
}
