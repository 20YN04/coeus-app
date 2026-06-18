import { listKennis, searchKennis, getCategories } from '@/lib/brein';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ q?: string; category?: string }>;
};

export default async function KennisbankPage({ searchParams }: Props) {
  const { q, category } = await searchParams;

  let items: Awaited<ReturnType<typeof listKennis>> = [];
  let categories: string[] = [];

  try {
    [items, categories] = await Promise.all([
      q ? searchKennis(q, { category }) : listKennis(category),
      getCategories(),
    ]);
  } catch {
  }

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">{q ? `Zoekresultaten voor "${q}"` : 'Alle kennis'}</p>
        <h1 className="page-title">Kennisbank</h1>
      </div>

      {categories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', marginBottom: 'var(--s-6)' }}>
          <FilterChip href="/kennisbank" label="Alles" active={!category} />
          {categories.map((cat) => (
            <FilterChip
              key={cat}
              href={`/kennisbank?${q ? `q=${encodeURIComponent(q)}&` : ''}category=${encodeURIComponent(cat)}`}
              label={cat}
              active={category === cat}
            />
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__label">Niets gevonden</p>
          <p className="empty-state__heading">Geen kennisitems</p>
        </div>
      ) : (
        <div className="kennis-grid">
          {items.map((item) => (
            <Link key={item.id} href={`/kennisbank/${item.id}`} className="kennis-card">
              <p className="kennis-card__category">{item.category}</p>
              <h2 className="kennis-card__title">{item.title}</h2>
              <p className="kennis-card__excerpt">{item.content}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.5625rem',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: active ? 'var(--c-field)' : 'var(--c-ink-muted)',
        background: active ? 'var(--c-ink)' : 'transparent',
        border: '1px solid var(--c-border)',
        padding: '0.375rem 0.75rem',
        textDecoration: 'none',
        transition: 'color 180ms, background 180ms',
      }}
    >
      {label}
    </Link>
  );
}
