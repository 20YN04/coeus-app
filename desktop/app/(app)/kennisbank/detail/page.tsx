'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getKennis, type KennisItem } from '@/lib/brein';
import DetailActions from './DetailActions';
import { useT } from '@/lib/i18n';

function renderBody(content: string) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return paragraphs.map((block, i) => {
    if (/^[-*]\s/.test(block)) {
      const lines = block.split('\n').filter(Boolean);
      return (
        <ul key={i} className="detail-body__list">
          {lines.map((line, j) => (
            <li key={j}>{line.replace(/^[-*]\s/, '')}</li>
          ))}
        </ul>
      );
    }
    const withBreaks = block.split('\n').reduce<React.ReactNode[]>((acc, line, j) => {
      if (j > 0) acc.push(<br key={`br-${j}`} />);
      acc.push(line);
      return acc;
    }, []);
    return <p key={i} className="detail-body__p">{withBreaks}</p>;
  });
}

function DetailLoader({ id }: { id: string }) {
  const { t, lang } = useT();
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

  const formattedDate = item.created_at
    ? new Date(item.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'nl-BE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/kennisbank" className="breadcrumb-link">
            {t('kennisbank.title')}
          </Link>
          <span className="breadcrumb-sep"> / </span>
          {item.category}
        </p>
        <h1 className="page-title">{item.title}</h1>
      </div>

      <div className="detail-layout">
        <article className="detail-content">
          <Link href="/kennisbank" className="detail-back">
            {t('detail.backShort')}
          </Link>
          <div className="detail-body">
            {renderBody(item.content)}
          </div>
        </article>

        <aside className="detail-meta">
          <div className="meta-block">
            <p className="meta-label">{t('detail.category')}</p>
            <p className="meta-value">{item.category}</p>
          </div>

          {item.source && (
            <div className="meta-block">
              <p className="meta-label">{t('detail.source')}</p>
              <p className="meta-value">
                <span className={`source-badge source-badge--${item.source === 'ai' ? 'ai' : 'handmatig'}`}>
                  {item.source === 'ai' ? t('common.source.aiGenerated') : t('common.source.manual')}
                </span>
              </p>
            </div>
          )}

          {item.source_detail && (
            <div className="meta-block">
              <p className="meta-label">{t('detail.sourceDetail')}</p>
              <p className="meta-value meta-value--muted">{item.source_detail}</p>
            </div>
          )}

          {formattedDate && (
            <div className="meta-block">
              <p className="meta-label">{t('detail.createdAt')}</p>
              <p className="meta-value meta-value--muted">{formattedDate}</p>
            </div>
          )}

          <div className="detail-actions">
            <Link href={`/kennisbank/bewerken?id=${encodeURIComponent(item.id)}`} className="btn-outline">
              {t('common.edit')}
            </Link>
            <DetailActions id={item.id} title={item.title} />
          </div>
        </aside>
      </div>
    </>
  );
}

function DetailInner() {
  // `key` remounts the loader when the id changes, so its initial state is
  // always derived correctly from the current id (no setState-in-effect).
  const id = useSearchParams().get('id') ?? '';
  return <DetailLoader key={id} id={id} />;
}

export default function KennisDetailPage() {
  const { t } = useT();
  return (
    <Suspense fallback={<div className="page-loading" role="status">{t('common.loading')}</div>}>
      <DetailInner />
    </Suspense>
  );
}
