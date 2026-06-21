'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ingestText,
  learnText,
  ingestUrl,
  ingestCrawl,
  ingestFile,
  waitForBrein,
} from '@/lib/brein';

type Mode = 'tekst' | 'website' | 'bestand';
type WebMode = 'pagina' | 'crawl';

export default function ImporterenPage() {
  const [mode, setMode] = useState<Mode>('tekst');
  const [webMode, setWebMode] = useState<WebMode>('pagina');
  const [ready, setReady] = useState(false);
  const [breinError, setBreinError] = useState('');

  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [maxPages, setMaxPages] = useState(15);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState('');
  // AI-extractie: laat de LLM gestructureerde kennis uit de tekst halen i.p.v.
  // het key-free hakken. Vereist een ingestelde AI-sleutel (zie Instellingen → AI).
  const [useAi, setUseAi] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);

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
    } else if (mode === 'website') {
      if (!url.trim()) {
        setError('Vul een website-URL in.');
        return;
      }
    } else if (!file) {
      setError('Kies eerst een bestand om te importeren.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'tekst') {
        if (useAi) {
          const res = await learnText(text.trim(), cat);
          setResult(`${res.geleerd} ${res.geleerd === 1 ? 'item geleerd' : 'items geleerd'}`);
        } else {
          const res = await ingestText(text.trim(), { category: cat });
          setResult(`${res.toegevoegd} ${res.toegevoegd === 1 ? 'item toegevoegd' : 'items toegevoegd'}`);
        }
        setText('');
      } else if (mode === 'website') {
        if (webMode === 'crawl') {
          const res = await ingestCrawl(url.trim(), { category: cat, maxPages });
          setResult(
            `${res.toegevoegd} ${res.toegevoegd === 1 ? 'item' : 'items'} van ${res.paginas} ${res.paginas === 1 ? 'pagina' : "pagina's"}`,
          );
        } else {
          const res = await ingestUrl(url.trim(), { category: cat });
          setResult(`${res.toegevoegd} ${res.toegevoegd === 1 ? 'item toegevoegd' : 'items toegevoegd'}`);
        }
        setUrl('');
      } else {
        const res = await ingestFile(file!, { category: cat });
        setResult(`${res.toegevoegd} ${res.toegevoegd === 1 ? 'item toegevoegd' : 'items toegevoegd'}`);
        setFile(null);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Er ging iets mis bij het importeren.';
      // 502/503 bij AI-extractie = geen LLM-sleutel ingesteld.
      if (mode === 'tekst' && useAi && /\b50[23]\b/.test(message)) {
        setError(
          'AI-extractie vereist een AI-sleutel — stel die in bij Instellingen → AI, of zet AI-extractie uit voor key-vrij importeren.',
        );
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = loading
    ? 'Importeren…'
    : mode === 'tekst'
      ? useAi
        ? 'Tekst leren (AI)'
        : 'Tekst importeren'
      : mode === 'website'
        ? webMode === 'crawl'
          ? 'Site crawlen'
          : 'Website importeren'
        : 'Bestand importeren';

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Kennisbank</p>
        <h1 className="page-title">Importeren</h1>
      </div>

      <p className="import-intro">
        Vul de kennisbank zonder handmatig te typen. Plak een lap tekst, geef een
        website-URL op (één pagina of een hele site) of upload een bestand — Coeus
        hakt het in zinnige stukken en bewaart elk stuk als kennis-item. Geen
        AI-sleutel nodig.
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
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'bestand'}
          className="filter-chip"
          data-active={mode === 'bestand' ? 'true' : undefined}
          onClick={() => switchMode('bestand')}
        >
          Upload bestand
        </button>
      </div>

      {breinError && (
        <div className="api-error-banner">
          <span>{breinError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="kennis-form">
        {mode === 'tekst' && (
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
            <label className="import-ai-toggle">
              <input
                type="checkbox"
                checked={useAi}
                onChange={(e) => setUseAi(e.target.checked)}
              />
              <span>
                AI-extractie (slimmer) <span className="import-optional">— vereist een AI-sleutel</span>
              </span>
            </label>
          </div>
        )}

        {mode === 'website' && (
          <>
            <div
              className="import-subtoggle"
              role="tablist"
              aria-label="Website-importmodus"
            >
              <button
                type="button"
                role="tab"
                aria-selected={webMode === 'pagina'}
                className="filter-chip"
                data-active={webMode === 'pagina' ? 'true' : undefined}
                onClick={() => setWebMode('pagina')}
              >
                Enkele pagina
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={webMode === 'crawl'}
                className="filter-chip"
                data-active={webMode === 'crawl' ? 'true' : undefined}
                onClick={() => setWebMode('crawl')}
              >
                Hele site (crawl)
              </button>
            </div>

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

            {webMode === 'crawl' && (
              <div className="form-field">
                <label className="form-label" htmlFor="im-maxpages">
                  Max. pagina&apos;s <span className="import-optional">— optioneel</span>
                </label>
                <input
                  id="im-maxpages"
                  className="form-input import-maxpages"
                  type="number"
                  min={1}
                  max={50}
                  value={maxPages}
                  onChange={(e) =>
                    setMaxPages(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                  }
                />
              </div>
            )}
          </>
        )}

        {mode === 'bestand' && (
          <div className="form-field">
            <label className="form-label" htmlFor="im-file">
              Bestand <span aria-hidden="true">*</span>
              <span className="import-optional"> — .pdf, .md, .txt</span>
            </label>
            <div className="import-file">
              <input
                id="im-file"
                className="import-file__input"
                type="file"
                accept=".pdf,.md,.markdown,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <label className="import-file__label" htmlFor="im-file">
                <span aria-hidden="true">↥</span>
                <span>Kies een bestand</span>
              </label>
              {file && <span className="import-file__name">{file.name}</span>}
            </div>
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
            <p className="import-result__count">{result}</p>
            <Link href="/kennisbank" className="btn-ghost-sm">
              Bekijk in kennisbank →
            </Link>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={loading || !ready}>
            <span>{submitLabel}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </>
  );
}
