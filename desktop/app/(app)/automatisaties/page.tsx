'use client';

import { useT } from '@/lib/i18n';

const ICONS = [
  (
    <svg key="mail" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
      <rect x="2" y="3.5" width="12" height="9" rx="1" />
      <path d="M2.5 4.5l5.5 4 5.5-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  (
    <svg key="webhook" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
      <circle cx="4" cy="11.5" r="2" />
      <circle cx="12" cy="11.5" r="2" />
      <circle cx="8" cy="4" r="2" />
      <path d="M6.5 5.5L4.8 9.6M9.5 5.5l1.7 4.1M6 11.5h4" strokeLinecap="round" />
    </svg>
  ),
  (
    <svg key="schedule" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  (
    <svg key="sync" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
      <path d="M11.5 5.5a4 4 0 1 0 .9 3" strokeLinecap="round" />
      <path d="M11.5 2.5v3h-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
];

export default function AutomatisatiesPage() {
  const { t, tList } = useT();
  const items = tList<{ name: string; desc: string }[]>('automatisaties.items');

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">{t('automatisaties.eyebrow')}</p>
        <h1 className="page-title">{t('automatisaties.title')}</h1>
      </div>

      <div className="automations-layout">
        <section className="automations-intro">
          <p className="automations-intro__lead">{t('automatisaties.lead')}</p>
          <p className="automations-intro__note">{t('automatisaties.note')}</p>
        </section>

        <div className="automation-grid">
          {items.map(({ name, desc }, i) => (
            <article key={name} className="automation-card">
              <div className="automation-card__top">
                <span className="automation-card__icon" aria-hidden="true">
                  {ICONS[i]}
                </span>
                <span className="automation-card__status">{t('automatisaties.soon')}</span>
              </div>
              <h2 className="automation-card__name">{name}</h2>
              <p className="automation-card__desc">{desc}</p>
              <span className="automation-card__wire" aria-hidden="true">
                {t('automatisaties.notConnected')}
              </span>
            </article>
          ))}
        </div>

        <div className="automations-cta">
          <button type="button" className="btn-ghost-sm" disabled>
            {t('automatisaties.connectCta')}
          </button>
          <span className="automations-cta__hint">{t('automatisaties.connectHint')}</span>
        </div>
      </div>
    </>
  );
}
