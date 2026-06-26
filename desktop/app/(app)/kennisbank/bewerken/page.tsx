'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getKennis, type KennisItem } from '@/lib/brein';
import KennisForm from '@/app/(app)/components/KennisForm';
import { useT } from '@/lib/i18n';

function BewerkenLoader({ id }: { id: string }) {
  const { t } = useT();
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
    return <div className="page-loading" role="status">{t('common.loading')}</div>;
  }

  if (status === 'notfound' || !item) {
    return (
      <div className="empty-state">
        <p className="empty-state__label">{t('common.notFound')}</p>
        <p className="empty-state__heading">{t('detail.notFoundHeading')}</p>
        <Link href="/kennisbank" className="btn-ghost-sm">{t('detail.backToKennisbank')}</Link>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/kennisbank" className="breadcrumb-link">{t('kennisbank.title')}</Link>
          <span className="breadcrumb-sep"> / </span>
          <Link href={`/kennisbank/detail?id=${encodeURIComponent(item.id)}`} className="breadcrumb-link">{item.title}</Link>
          <span className="breadcrumb-sep"> / </span>
          {t('bewerken.title')}
        </p>
        <h1 className="page-title">{t('bewerken.title')}</h1>
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
  const { t } = useT();
  return (
    <Suspense fallback={<div className="page-loading" role="status">{t('common.loading')}</div>}>
      <BewerkenInner />
    </Suspense>
  );
}
