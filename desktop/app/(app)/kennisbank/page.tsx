'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import KennisbankClient from './KennisbankClient';
import { useT } from '@/lib/i18n';

function KennisbankInner() {
  const sp = useSearchParams();
  return (
    <KennisbankClient
      initialCategory={sp.get('categorie') ?? undefined}
      initialQuery={sp.get('q') ?? undefined}
    />
  );
}

export default function KennisbankPage() {
  const { t } = useT();
  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">{t('kennisbank.eyebrow')}</p>
        <h1 className="page-title">{t('kennisbank.title')}</h1>
      </div>

      {/* useSearchParams must sit behind a Suspense boundary in a static export. */}
      <Suspense fallback={<div className="page-loading" role="status">{t('common.loading')}</div>}>
        <KennisbankInner />
      </Suspense>
    </>
  );
}
