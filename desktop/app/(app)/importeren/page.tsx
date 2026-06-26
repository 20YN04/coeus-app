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
import { useT } from '@/lib/i18n';

type Mode = 'tekst' | 'website' | 'bestand';
type WebMode = 'pagina' | 'crawl';

export default function ImporterenPage() {
  const { t } = useT();
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
      if (!ok) setBreinError(t('common.breinUnreachableShort'));
    });
    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setError(t('importeren.errPasteText'));
        return;
      }
    } else if (mode === 'website') {
      if (!url.trim()) {
        setError(t('importeren.errFillUrl'));
        return;
      }
    } else if (!file) {
      setError(t('importeren.errChooseFile'));
      return;
    }

    setLoading(true);
    try {
      if (mode === 'tekst') {
        if (useAi) {
          const res = await learnText(text.trim(), cat);
          setResult(
            res.geleerd === 1
              ? t('importeren.resultItemsLearned', { count: res.geleerd })
              : t('importeren.resultItemsLearnedPlural', { count: res.geleerd }),
          );
        } else {
          const res = await ingestText(text.trim(), { category: cat });
          setResult(
            res.toegevoegd === 1
              ? t('importeren.resultItemsAdded', { count: res.toegevoegd })
              : t('importeren.resultItemsAddedPlural', { count: res.toegevoegd }),
          );
        }
        setText('');
      } else if (mode === 'website') {
        if (webMode === 'crawl') {
          const res = await ingestCrawl(url.trim(), { category: cat, maxPages });
          setResult(
            res.toegevoegd === 1 && res.paginas === 1
              ? t('importeren.resultCrawlSingle', { count: res.toegevoegd, pages: res.paginas })
              : t('importeren.resultCrawlPlural', { count: res.toegevoegd, pages: res.paginas }),
          );
        } else {
          const res = await ingestUrl(url.trim(), { category: cat });
          setResult(
            res.toegevoegd === 1
              ? t('importeren.resultItemsAdded', { count: res.toegevoegd })
              : t('importeren.resultItemsAddedPlural', { count: res.toegevoegd }),
          );
        }
        setUrl('');
      } else {
        const res = await ingestFile(file!, { category: cat });
        setResult(
          res.toegevoegd === 1
            ? t('importeren.resultItemsAdded', { count: res.toegevoegd })
            : t('importeren.resultItemsAddedPlural', { count: res.toegevoegd }),
        );
        setFile(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('importeren.errGeneric');
      // 502/503 bij AI-extractie = geen LLM-sleutel ingesteld.
      if (mode === 'tekst' && useAi && /\b50[23]\b/.test(message)) {
        setError(t('importeren.errAiNoKey'));
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = loading
    ? t('importeren.submitImporting')
    : mode === 'tekst'
      ? useAi
        ? t('importeren.submitLearnAi')
        : t('importeren.submitText')
      : mode === 'website'
        ? webMode === 'crawl'
          ? t('importeren.submitCrawl')
          : t('importeren.submitWebsite')
        : t('importeren.submitFile');

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">{t('importeren.eyebrow')}</p>
        <h1 className="page-title">{t('importeren.title')}</h1>
      </div>

      <p className="import-intro">{t('importeren.intro')}</p>

      <div className="kb-filters" role="tablist" aria-label={t('importeren.modeAriaLabel')}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'tekst'}
          className="filter-chip"
          data-active={mode === 'tekst' ? 'true' : undefined}
          onClick={() => switchMode('tekst')}
        >
          {t('importeren.modeText')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'website'}
          className="filter-chip"
          data-active={mode === 'website' ? 'true' : undefined}
          onClick={() => switchMode('website')}
        >
          {t('importeren.modeWebsite')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'bestand'}
          className="filter-chip"
          data-active={mode === 'bestand' ? 'true' : undefined}
          onClick={() => switchMode('bestand')}
        >
          {t('importeren.modeFile')}
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
              {t('importeren.textLabel')} <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="im-text"
              className="form-input form-textarea"
              placeholder={t('importeren.textPlaceholder')}
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
                {t('importeren.aiToggleLabel')} <span className="import-optional">{t('importeren.aiToggleHint')}</span>
              </span>
            </label>
          </div>
        )}

        {mode === 'website' && (
          <>
            <div
              className="import-subtoggle"
              role="tablist"
              aria-label={t('importeren.webModeAriaLabel')}
            >
              <button
                type="button"
                role="tab"
                aria-selected={webMode === 'pagina'}
                className="filter-chip"
                data-active={webMode === 'pagina' ? 'true' : undefined}
                onClick={() => setWebMode('pagina')}
              >
                {t('importeren.webSinglePage')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={webMode === 'crawl'}
                className="filter-chip"
                data-active={webMode === 'crawl' ? 'true' : undefined}
                onClick={() => setWebMode('crawl')}
              >
                {t('importeren.webCrawl')}
              </button>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="im-url">
                {t('importeren.urlLabel')} <span aria-hidden="true">*</span>
              </label>
              <input
                id="im-url"
                className="form-input"
                type="url"
                inputMode="url"
                placeholder={t('importeren.urlPlaceholder')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            {webMode === 'crawl' && (
              <div className="form-field">
                <label className="form-label" htmlFor="im-maxpages">
                  {t('importeren.maxPagesLabel')} <span className="import-optional">{t('importeren.maxPagesHint')}</span>
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
              {t('importeren.fileLabel')} <span aria-hidden="true">*</span>
              <span className="import-optional"> {t('importeren.fileHint')}</span>
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
                <span>{t('importeren.fileChoose')}</span>
              </label>
              {file && <span className="import-file__name">{file.name}</span>}
            </div>
          </div>
        )}

        <div className="form-field">
          <label className="form-label" htmlFor="im-category">
            {t('importeren.categoryLabel')} <span className="import-optional">{t('importeren.categoryHint')}</span>
          </label>
          <input
            id="im-category"
            className="form-input"
            type="text"
            placeholder={t('importeren.categoryPlaceholder')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        {result !== null && (
          <div className="import-result">
            <p className="import-result__count">{result}</p>
            <Link href="/kennisbank" className="btn-ghost-sm">
              {t('importeren.viewInKennisbank')}
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
