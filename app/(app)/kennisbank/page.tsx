'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import KennisbankClient from './KennisbankClient';

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
  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Alle kennis</p>
        <h1 className="page-title">Kennisbank</h1>
      </div>

      {/* useSearchParams must sit behind a Suspense boundary in a static export. */}
      <Suspense fallback={<div className="page-loading" role="status">Laden…</div>}>
        <KennisbankInner />
      </Suspense>
    </>
  );
}
