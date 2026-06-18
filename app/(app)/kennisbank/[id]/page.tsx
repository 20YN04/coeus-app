import { getKennis } from '@/lib/brein';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import DetailActions from './DetailActions';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function KennisDetailPage({ params }: Props) {
  const { id } = await params;

  let item: Awaited<ReturnType<typeof getKennis>> | null = null;
  try {
    item = await getKennis(id);
  } catch {
    notFound();
  }

  if (!item) notFound();

  const formattedDate = item.created_at
    ? new Date(item.created_at).toLocaleDateString('nl-BE', {
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
            Kennisbank
          </Link>
          <span className="breadcrumb-sep"> / </span>
          {item.category}
        </p>
        <h1 className="page-title">{item.title}</h1>
      </div>

      <div className="detail-layout">
        <article className="detail-content">
          <div className="detail-body">
            {item.content}
          </div>
        </article>

        <aside className="detail-meta">
          <div className="meta-block">
            <p className="meta-label">Categorie</p>
            <p className="meta-value">{item.category}</p>
          </div>

          {item.source && (
            <div className="meta-block">
              <p className="meta-label">Bron</p>
              <p className="meta-value">
                <span className={`source-badge source-badge--${item.source === 'ai' ? 'ai' : 'handmatig'}`}>
                  {item.source === 'ai' ? '🤖 AI gegenereerd' : '✍ Handmatig'}
                </span>
              </p>
            </div>
          )}

          {item.source_detail && (
            <div className="meta-block">
              <p className="meta-label">Bron detail</p>
              <p className="meta-value meta-value--muted">{item.source_detail}</p>
            </div>
          )}

          {formattedDate && (
            <div className="meta-block">
              <p className="meta-label">Aangemaakt</p>
              <p className="meta-value meta-value--muted">{formattedDate}</p>
            </div>
          )}

          <div className="detail-actions">
            <Link href={`/kennis/${item.id}/bewerken`} className="btn-outline">
              Bewerken
            </Link>
            <DetailActions id={item.id} title={item.title} />
          </div>
        </aside>
      </div>
    </>
  );
}
