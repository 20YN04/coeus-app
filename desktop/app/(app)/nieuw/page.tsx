'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import KennisForm from '@/app/(app)/components/KennisForm';
import { useT } from '@/lib/i18n';

function NieuwInner() {
  const { t } = useT();
  // Voorgevulde titel vanuit het weekrapport ("Beantwoord dit →" bij een
  // onbeantwoorde vraag, zie app/(app)/digest/page.tsx). key={titel} forceert
  // een verse KennisForm-instantie wanneer de query-param verandert.
  const titel = useSearchParams().get('titel') ?? '';

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">{t('nieuw.eyebrow')}</p>
        <h1 className="page-title">{t('nieuw.title')}</h1>
      </div>

      <KennisForm mode="create" initialTitle={titel} key={titel} />
    </>
  );
}

export default function NieuwPage() {
  const { t } = useT();
  return (
    <Suspense fallback={<div className="page-loading" role="status">{t('common.loading')}</div>}>
      <NieuwInner />
    </Suspense>
  );
}
