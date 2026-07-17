'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getDigest, waitForBrein, type DigestResult } from '@/lib/brein';
import { useT } from '@/lib/i18n';

const BREIN_URL = process.env.NEXT_PUBLIC_BREIN_URL ?? 'http://127.0.0.1:8765';

type Period = 7 | 30;

export default function DigestPage() {
  const { t, lang } = useT();
  const [period, setPeriod] = useState<Period>(7);
  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        await waitForBrein(undefined, ctrl.signal);
        const result = await getDigest(period, lang);
        if (!alive) return;
        setDigest(result);
        setApiError(false);
      } catch {
        if (alive) setApiError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [period, lang]);

  // vragen_gesteld telt élke ask-call in de periode; vragen_onbeantwoord
  // dedupliceert op vraagtekst maar houdt de occurrence-count bij — het
  // verschil is dus precies hoeveel vragen écht beantwoord werden.
  const vragenBeantwoord = useMemo(() => {
    if (!digest) return 0;
    const onbeantwoord = digest.vragen_onbeantwoord.reduce((sum, q) => sum + q.count, 0);
    return Math.max(0, digest.vragen_gesteld - onbeantwoord);
  }, [digest]);

  const isEmpty =
    !!digest &&
    digest.items_nieuw === 0 &&
    digest.vragen_gesteld === 0 &&
    digest.feedback_negatief.length === 0;

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">{t('digest.eyebrow')}</p>
        <h1 className="page-title page-title--serif">{t('digest.title')}</h1>
      </div>

      {apiError && (
        <div className="api-error-banner">
          <span>{t('common.breinUnreachable', { url: BREIN_URL })}</span>
        </div>
      )}

      {loading && !apiError && (
        <div className="page-loading" role="status">{t('common.loading')}</div>
      )}

      {!loading && !apiError && digest && (
        <div className="digest">
          <div className="digest-period" role="group" aria-label={t('digest.periodeLabel')}>
            <button
              type="button"
              className="digest-period__btn"
              data-active={period === 7 ? 'true' : undefined}
              onClick={() => setPeriod(7)}
            >
              {t('digest.period7')}
            </button>
            <button
              type="button"
              className="digest-period__btn"
              data-active={period === 30 ? 'true' : undefined}
              onClick={() => setPeriod(30)}
            >
              {t('digest.period30')}
            </button>
          </div>

          {isEmpty ? (
            <div className="empty-state">
              <p className="empty-state__label">{t('digest.emptyLabel')}</p>
              <p className="empty-state__heading">{t('digest.emptyHeading')}</p>
              <p className="import-intro">{t('digest.emptyHint')}</p>
            </div>
          ) : (
            <>
              <div className="stat-pair digest-stats">
                <div className="stat-cell">
                  <p className="stat-cell__label">{t('digest.itemsGeleerd')}</p>
                  <p className="stat-cell__value">{digest.items_nieuw}</p>
                </div>
                <div className="stat-cell">
                  <p className="stat-cell__label">{t('digest.vragenBeantwoord')}</p>
                  <p className="stat-cell__value">{vragenBeantwoord}</p>
                </div>
              </div>

              {digest.samenvatting && (
                <div className="digest-section">
                  <p className="section-label">{t('digest.samenvattingTitle')}</p>
                  <p className="digest-samenvatting">{digest.samenvatting}</p>
                </div>
              )}

              <div className="digest-section">
                <div className="section-header">
                  <p className="section-label">{t('digest.onbeantwoordTitle')}</p>
                </div>
                <p className="import-intro">{t('digest.onbeantwoordHint')}</p>
                {digest.vragen_onbeantwoord.length === 0 ? (
                  <p className="digest-empty-line">{t('digest.onbeantwoordEmpty')}</p>
                ) : (
                  <ul className="digest-list">
                    {digest.vragen_onbeantwoord.map((q) => (
                      <li key={q.vraag} className="digest-gap-row">
                        <span className="digest-gap-row__count">
                          {t('digest.onbeantwoordCount', { count: q.count })}
                        </span>
                        <span className="digest-gap-row__vraag">{q.vraag}</span>
                        <Link
                          href={`/nieuw?titel=${encodeURIComponent(q.vraag)}`}
                          className="digest-gap-row__cta"
                        >
                          {t('digest.answerCta')}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="digest-section">
                <div className="section-header">
                  <p className="section-label">{t('digest.categorieenTitle')}</p>
                </div>
                <p className="import-intro">{t('digest.categorieenHint')}</p>
                {digest.zwakke_categorieen.length === 0 ? (
                  <p className="digest-empty-line">{t('digest.categorieenEmpty')}</p>
                ) : (
                  <ul className="digest-list">
                    {digest.zwakke_categorieen.map((c) => (
                      <li key={c.categorie} className="digest-thin-row">
                        <span className="digest-thin-row__name">{c.categorie}</span>
                        <span className="digest-thin-row__count">
                          {t('digest.categorieenCount', { count: c.items })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="digest-section">
                <div className="section-header">
                  <p className="section-label">{t('digest.feedbackTitle')}</p>
                </div>
                {digest.feedback_negatief.length === 0 ? (
                  <p className="digest-empty-line">{t('digest.feedbackEmpty')}</p>
                ) : (
                  <ul className="digest-list">
                    {digest.feedback_negatief.map((f, i) => (
                      <li key={`${f.vraag}-${i}`} className="digest-feedback-row">
                        <span className="digest-feedback-row__vraag">{f.vraag}</span>
                        <span className="digest-feedback-row__reason">
                          {f.reason || t('digest.feedbackReasonUnknown')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
