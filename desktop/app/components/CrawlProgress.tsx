'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n';
import { useCrawlProgress } from '@/lib/useCrawlProgress';

type Props = {
  jobId: string;
  sourceUrl: string;
  doneHref?: string;
};

// Live voortgang van een async crawl-job (POST /ingest/crawl?async=true).
// Gedeeld tussen /welkom stap 3 en de Importeren-crawl-mode — zelfde
// component, andere plek. De balk is transform-only en dubbel-gated (zie
// globals.css .welkom-progress__bar): de breedte komt uit React state, de
// transitie zelf schakelt uit onder reduced-motion. Zonder JS of bij een
// falende poll blijft de content gewoon zichtbaar — nooit een oneindige
// spinner (10min timeout hieronder, via useCrawlProgress).
export default function CrawlProgress({ jobId, sourceUrl, doneHref = '/kennisbank' }: Props) {
  const { t } = useT();
  const { status, pollError, timedOut } = useCrawlProgress(jobId);

  if (timedOut) {
    return (
      <div className="welkom-body">
        <p className="welkom-eyebrow">{t('welkom.stap3.eyebrow')}</p>
        <h2 className="welkom-title">{t('welkom.stap3.timeoutHeading')}</h2>
        <p className="welkom-lead">{t('welkom.stap3.timeoutHint')}</p>
        <div className="welkom-actions">
          <Link href={doneHref} className="btn-primary-sm">
            {t('welkom.stap3.viewKennisbank')}
          </Link>
        </div>
      </div>
    );
  }

  if (status?.status === 'error') {
    return (
      <div className="welkom-body">
        <p className="welkom-eyebrow">{t('welkom.stap3.eyebrow')}</p>
        <h2 className="welkom-title">{t('welkom.stap3.errorHeading')}</h2>
        <p className="welkom-lead">{t('welkom.stap3.errorHint')}</p>
        {status.toegevoegd > 0 && (
          <p className="welkom-done__count">
            {status.toegevoegd === 1
              ? t('welkom.stap3.doneSummaryOneNoCleanup', { items: status.toegevoegd })
              : t('welkom.stap3.doneSummaryNoCleanup', { items: status.toegevoegd })}
          </p>
        )}
        <div className="welkom-actions">
          <Link href={doneHref} className="btn-primary-sm">
            {t('welkom.stap3.viewKennisbank')}
          </Link>
        </div>
      </div>
    );
  }

  if (status?.status === 'done') {
    const cleaned = status.opgeschoond ?? 0;
    const one = status.toegevoegd === 1;
    return (
      <div className="welkom-body">
        <p className="welkom-eyebrow">{t('welkom.stap3.eyebrow')}</p>
        <h2 className="welkom-title">{t('welkom.stap3.doneHeading')}</h2>
        <p className="welkom-done__count">
          {cleaned > 0
            ? t(one ? 'welkom.stap3.doneSummaryOne' : 'welkom.stap3.doneSummary', { items: status.toegevoegd, cleaned })
            : t(one ? 'welkom.stap3.doneSummaryOneNoCleanup' : 'welkom.stap3.doneSummaryNoCleanup', { items: status.toegevoegd })}
        </p>
        <div className="welkom-actions">
          <Link href={doneHref} className="btn-primary-sm">
            {t('welkom.stap3.viewKennisbank')}
          </Link>
        </div>
      </div>
    );
  }

  // "running" of nog geen eerste status binnen — toon meteen de bekende
  // waarden (bezocht=0) i.p.v. te wachten op de eerste tick.
  const bezocht = status?.paginas_bezocht ?? 0;
  const totaal = Math.max(status?.paginas_totaal_geschat ?? 1, bezocht, 1);
  const ratio = Math.min(1, bezocht / totaal);

  return (
    <div className="welkom-body">
      <p className="welkom-eyebrow">{t('welkom.stap3.eyebrow')}</p>
      <h2 className="welkom-title">{t('welkom.stap3.title')}</h2>
      <p className="welkom-lead">{t('welkom.stap3.lead', { url: sourceUrl })}</p>

      <div className="welkom-progress" role="group" aria-label={t('welkom.stap3.title')}>
        <div className="welkom-progress__track">
          <div
            className="welkom-progress__bar"
            style={{ transform: `scaleX(${ratio})` }}
            role="progressbar"
            aria-valuenow={bezocht}
            aria-valuemin={0}
            aria-valuemax={totaal}
          />
        </div>
        <div className="welkom-progress__meta">
          <span>{t('welkom.stap3.pagesLabel')}: {bezocht}</span>
          <span>{t('welkom.stap3.itemsLabel')}: {status?.toegevoegd ?? 0}</span>
        </div>
        {status?.huidige_url && (
          <p className="welkom-progress__url">
            {t('welkom.stap3.currentUrlLabel')}: {status.huidige_url}
          </p>
        )}
        {pollError && <p className="welkom-progress__hint">{t('welkom.stap3.pollErrorHint')}</p>}
      </div>

      <div className="welkom-actions">
        <Link href={doneHref} className="btn-ghost">
          {t('welkom.stap3.leaveScreen')}
        </Link>
      </div>
    </div>
  );
}
