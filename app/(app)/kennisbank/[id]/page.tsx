import { getKennis } from '@/lib/brein';
import Link from 'next/link';
import { notFound } from 'next/navigation';

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

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/kennisbank" style={{ color: 'var(--c-ink-muted)', textDecoration: 'none' }}>
            Kennisbank
          </Link>
          {' / '}
          {item.category}
        </p>
        <h1 className="page-title">{item.title}</h1>
      </div>

      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.875rem',
        lineHeight: 1.75,
        letterSpacing: '0.02em',
        color: 'var(--c-ink-muted)',
        maxWidth: '64ch',
        whiteSpace: 'pre-wrap',
      }}>
        {item.content}
      </div>

      <div style={{ marginTop: 'var(--s-12)', paddingTop: 'var(--s-6)', borderTop: '1px solid var(--c-border)' }}>
        <Link
          href="/kennisbank"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.625rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--c-ink-muted)',
            textDecoration: 'none',
          }}
        >
          ← Terug naar kennisbank
        </Link>
      </div>
    </>
  );
}
