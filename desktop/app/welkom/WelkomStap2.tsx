'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ingestCrawlAsync, waitForBrein } from '@/lib/brein';
import { useT } from '@/lib/i18n';

type Props = {
  onLater: () => void;
  onCrawlStarted: (jobId: string, url: string) => void;
};

export default function WelkomStap2({ onLater, onCrawlStarted }: Props) {
  const { t } = useT();
  const [ready, setReady] = useState(false);
  const [breinError, setBreinError] = useState('');
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [url, setUrl] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

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

  async function startCrawl(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError(t('welkom.stap2.errFillUrl'));
      return;
    }
    setError('');
    setStarting(true);
    try {
      const res = await ingestCrawlAsync(trimmed);
      onCrawlStarted(res.job_id, trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('welkom.stap2.errGeneric'));
      setStarting(false);
    }
  }

  return (
    <div className="welkom-body">
      <p className="welkom-eyebrow">{t('welkom.stap2.eyebrow')}</p>
      <h2 className="welkom-title">{t('welkom.stap2.title')}</h2>
      <p className="welkom-lead">{t('welkom.stap2.lead')}</p>

      {breinError && (
        <div className="api-error-banner">
          <span>{breinError}</span>
        </div>
      )}

      <div className="welkom-cards">
        <div className="welkom-card" data-active={showUrlForm ? 'true' : undefined}>
          <button
            type="button"
            className="welkom-card__toggle"
            aria-expanded={showUrlForm}
            onClick={() => setShowUrlForm((v) => !v)}
          >
            <p className="welkom-card__label">{t('welkom.stap2.websiteLabel')}</p>
            <p className="welkom-card__title">{t('welkom.stap2.websiteTitle')}</p>
            <p className="welkom-card__desc">{t('welkom.stap2.websiteDesc')}</p>
          </button>

          {showUrlForm && (
            <form className="welkom-card-url" onSubmit={startCrawl}>
              <div className="welkom-card-url__row">
                <input
                  className="form-input"
                  type="url"
                  inputMode="url"
                  placeholder={t('welkom.stap2.urlPlaceholder')}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  aria-label={t('welkom.stap2.urlPlaceholder')}
                />
                <button type="submit" className="btn-primary-sm" disabled={starting || !ready}>
                  {starting ? t('welkom.stap2.starting') : t('welkom.stap2.startCrawl')}
                </button>
              </div>
              {error && <p className="form-error">{error}</p>}
            </form>
          )}
        </div>

        <Link href="/importeren" className="welkom-card welkom-card--link">
          <p className="welkom-card__label">{t('welkom.stap2.documentsLabel')}</p>
          <p className="welkom-card__title">{t('welkom.stap2.documentsTitle')}</p>
          <p className="welkom-card__desc">{t('welkom.stap2.documentsDesc')}</p>
        </Link>

        <button
          type="button"
          className="welkom-card"
          data-variant="ghost"
          onClick={onLater}
        >
          <p className="welkom-card__label">{t('welkom.stap2.laterLabel')}</p>
          <p className="welkom-card__title">{t('welkom.stap2.laterTitle')}</p>
          <p className="welkom-card__desc">{t('welkom.stap2.laterDesc')}</p>
        </button>
      </div>
    </div>
  );
}
