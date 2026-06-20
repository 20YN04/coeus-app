'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getKennis, type KennisItem } from '@/lib/brein';
import KennisForm from '@/app/(app)/components/KennisForm';

function BewerkenLoader({ id }: { id: string }) {
  const [item, setItem] = useState<KennisItem | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound'>(id ? 'loading' : 'notfound');

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getKennis(id)
      .then((res) => {
        if (!alive) return;
        if (res && res.id) {
          setItem(res);
          setStatus('ok');
        } else {
          setStatus('notfound');
        }
      })
      .catch(() => {
        if (alive) setStatus('notfound');
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (status === 'loading') {
    return <div className="page-loading" role="status">Laden…</div>;
  }

  if (status === 'notfound' || !item) {
    return (
      <div className="empty-state">
        <p className="empty-state__label">Niet gevonden</p>
        <p className="empty-state__heading">Dit kennisitem bestaat niet</p>
        <Link href="/kennisbank" className="btn-ghost-sm">← Terug naar kennisbank</Link>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/kennisbank" className="breadcrumb-link">Kennisbank</Link>
          <span className="breadcrumb-sep"> / </span>
          <Link href={`/kennisbank/detail?id=${encodeURIComponent(item.id)}`} className="breadcrumb-link">{item.title}</Link>
          <span className="breadcrumb-sep"> / </span>
          Bewerken
        </p>
        <h1 className="page-title">Bewerken</h1>
      </div>

      <KennisForm mode="edit" item={item} />
    </>
  );
}

function BewerkenInner() {
  const id = useSearchParams().get('id') ?? '';
  return <BewerkenLoader key={id} id={id} />;
}

export default function BewerkenPage() {
  return (
    <Suspense fallback={<div className="page-loading" role="status">Laden…</div>}>
      <BewerkenInner />
    </Suspense>
  );
}
