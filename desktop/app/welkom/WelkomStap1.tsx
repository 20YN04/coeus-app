'use client';

import { useT } from '@/lib/i18n';

export default function WelkomStap1({ onNext }: { onNext: () => void }) {
  const { t } = useT();

  return (
    <div className="welkom-body">
      <p className="welkom-eyebrow">{t('welkom.stap1.eyebrow')}</p>
      <h1 className="welkom-title">{t('welkom.stap1.title')}</h1>
      <p className="welkom-lead">{t('welkom.stap1.lead')}</p>
      <div className="welkom-actions">
        <button type="button" className="btn-primary" onClick={onNext}>
          <span>{t('welkom.stap1.cta')}</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
