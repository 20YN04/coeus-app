'use client';

import { useEffect, useState } from 'react';
import { getDigest, type DigestResult } from '@/lib/brein';
import { useT, type Lang } from '@/lib/i18n';
import {
  DEFAULT_HOURLY_RATE,
  DEFAULT_MINUTES_PER_QUESTION,
  HOURLY_RATE_KEY,
  MINUTES_PER_QUESTION_KEY,
  readNumberSetting,
  writeNumberSetting,
} from '@/lib/waarde';

// 30 dagen — bredere blik dan het weekrapport-default (7d), past bij "wat
// leverde Coeus je op" i.p.v. "wat gebeurde er deze week".
const WAARDE_PERIOD_DAYS = 30;

function formatHours(hours: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'nl-BE', {
    maximumFractionDigits: 1,
  }).format(hours);
}

function formatEuro(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'nl-BE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function WaardeBlok({ itemsTotaal }: { itemsTotaal: number }) {
  const { t, lang } = useT();
  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [minuten, setMinuten] = useState(() =>
    readNumberSetting(MINUTES_PER_QUESTION_KEY, DEFAULT_MINUTES_PER_QUESTION),
  );
  const [uurloon, setUurloon] = useState(() =>
    readNumberSetting(HOURLY_RATE_KEY, DEFAULT_HOURLY_RATE),
  );

  useEffect(() => {
    let alive = true;
    getDigest(WAARDE_PERIOD_DAYS, lang)
      .then((res) => {
        if (alive) setDigest(res);
      })
      .catch(() => {
        if (alive) setDigest(null);
      });
    return () => {
      alive = false;
    };
  }, [lang]);

  // Zelfde afleiding als het weekrapport: vragen_gesteld min de opgetelde
  // occurrence-counts van vragen_onbeantwoord = écht beantwoorde vragen.
  const vragenBeantwoord = digest
    ? Math.max(
        0,
        digest.vragen_gesteld - digest.vragen_onbeantwoord.reduce((sum, q) => sum + q.count, 0),
      )
    : 0;
  const uren = (vragenBeantwoord * minuten) / 60;
  const waarde = uren * uurloon;

  function handleMinutenChange(value: string) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    setMinuten(n);
    writeNumberSetting(MINUTES_PER_QUESTION_KEY, n);
  }

  function handleUurloonChange(value: string) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    setUurloon(n);
    writeNumberSetting(HOURLY_RATE_KEY, n);
  }

  return (
    <section className="waarde-block">
      <div className="section-header">
        <p className="section-label">{t('waarde.title')}</p>
      </div>

      <div className="waarde-grid">
        <div className="stat-cell">
          <p className="stat-cell__label">{t('waarde.vragenBeantwoord')}</p>
          <p className="stat-cell__value">{vragenBeantwoord}</p>
        </div>
        <div className="stat-cell">
          <p className="stat-cell__label">{t('waarde.itemsGeleerd')}</p>
          <p className="stat-cell__value">{itemsTotaal}</p>
        </div>
        <div className="stat-cell">
          <p className="stat-cell__label">{t('waarde.tijdwinst')}</p>
          <p className="stat-cell__value">
            {t('waarde.tijdwinstValue', { hours: formatHours(uren, lang) })}
          </p>
        </div>
        <div className="stat-cell">
          <p className="stat-cell__label">{t('waarde.waardeLabel')}</p>
          <p className="stat-cell__value">{formatEuro(waarde, lang)}</p>
        </div>
      </div>

      <div className="waarde-settings">
        <label className="waarde-settings__field">
          {t('waarde.minutenLabel')}
          <input
            type="number"
            min={1}
            max={120}
            className="waarde-settings__input"
            value={minuten}
            onChange={(e) => handleMinutenChange(e.target.value)}
          />
        </label>
        <label className="waarde-settings__field">
          {t('waarde.uurloonLabel')}
          <input
            type="number"
            min={1}
            max={1000}
            className="waarde-settings__input"
            value={uurloon}
            onChange={(e) => handleUurloonChange(e.target.value)}
          />
        </label>
        <p className="waarde-settings__caption">{t('waarde.caption')}</p>
      </div>
    </section>
  );
}
