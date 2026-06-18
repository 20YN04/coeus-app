import { listKennis, getCategories } from '@/lib/brein';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let recentItems: Awaited<ReturnType<typeof listKennis>> = [];
  let categories: string[] = [];

  try {
    [recentItems, categories] = await Promise.all([
      listKennis(),
      getCategories(),
    ]);
  } catch {
  }

  const recent = recentItems.slice(0, 6);

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Overzicht</p>
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div style={{ display: 'grid', gap: 'var(--s-8)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))',
          gap: '1px',
          background: 'var(--c-border)',
          border: '1px solid var(--c-border)',
        }}>
          <StatCard label="Kennisitems" value={recentItems.length} />
          <StatCard label="Categorieën" value={categories.length} />
        </div>

        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--s-4)' }}>
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.625rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--c-ink-muted)',
              margin: 0,
            }}>Recente items</p>
            <Link href="/kennisbank" style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.625rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--c-ink-muted)',
              textDecoration: 'none',
            }}>
              Alle items →
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state__label">Geen items</p>
              <p className="empty-state__heading">Kennisbank leeg</p>
            </div>
          ) : (
            <div className="kennis-grid">
              {recent.map((item) => (
                <Link key={item.id} href={`/kennisbank/${item.id}`} className="kennis-card">
                  <p className="kennis-card__category">{item.category}</p>
                  <h2 className="kennis-card__title">{item.title}</h2>
                  <p className="kennis-card__excerpt">{item.content}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: 'var(--c-field)',
      padding: 'var(--s-6)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--s-2)',
    }}>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.5625rem',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--c-ink-muted)',
        margin: 0,
      }}>{label}</p>
      <span style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '2.5rem',
        fontWeight: 300,
        lineHeight: 0.88,
        letterSpacing: '-0.04em',
        color: 'var(--c-ink)',
      }}>{value}</span>
    </div>
  );
}
