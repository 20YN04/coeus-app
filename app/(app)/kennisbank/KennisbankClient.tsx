'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { listKennis, searchKennis, type KennisItem } from '@/lib/brein';

function CategoryIcon({ category }: { category: string }) {
  const key = category.toLowerCase();
  const shared = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.25 } as const;

  if (key === 'procedures') return (
    <svg {...shared}><path d="M8 2v4l2.5 2.5M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2z" strokeLinecap="round" /></svg>
  );
  if (key === 'producten') return (
    <svg {...shared}><rect x="2" y="2" width="5" height="5" /><rect x="9" y="2" width="5" height="5" /><rect x="2" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" /></svg>
  );
  if (key === 'hr') return (
    <svg {...shared}><circle cx="8" cy="5.5" r="2.5" /><path d="M3 14c0-2.76 2.24-5 5-5s5 2.24 5 5" strokeLinecap="round" /></svg>
  );
  if (key === 'technisch') return (
    <svg {...shared}><path d="M2 4h12M2 8h8M2 12h10" strokeLinecap="round" /><circle cx="13" cy="8" r="1.5" /></svg>
  );
  if (key === 'klanten') return (
    <svg {...shared}><circle cx="6" cy="5.5" r="2" /><circle cx="11" cy="5.5" r="2" /><path d="M2 14c0-2.21 1.79-4 4-4s4 1.79 4 4" strokeLinecap="round" /><path d="M11 11c1.66 0 3 1.34 3 3" strokeLinecap="round" /></svg>
  );
  if (key === 'finance') return (
    <svg {...shared}><rect x="2" y="4" width="12" height="9" rx="1" /><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M8 8v2M6 9h4" strokeLinecap="round" /></svg>
  );
  if (key === 'marketing') return (
    <svg {...shared}><path d="M2 11V6l5-3 5 3v5" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 14v-4h4v4" strokeLinecap="round" /></svg>
  );
  return (
    <svg {...shared}><path d="M2 3h12M2 6h9M2 9h11M2 12h7" strokeLinecap="round" /></svg>
  );
}

type Props = {
  initialItems: KennisItem[];
  categories: string[];
  initialCategory?: string;
  initialApiError?: boolean;
};

export default function KennisbankClient({ initialItems, categories, initialCategory, initialApiError }: Props) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(initialCategory ?? '');
  const [items, setItems] = useState<KennisItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialApiError ? 'Kan geen verbinding maken met het brein.' : '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchItems = useCallback(
    async (q: string, cat: string) => {
      setLoading(true);
      setError('');
      try {
        const result = q.trim()
          ? await searchKennis(q.trim(), { category: cat || undefined })
          : await listKennis(cat || undefined);
        setItems(result);
      } catch {
        setError('Kan geen verbinding maken met het brein.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchItems(query, activeCategory);
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeCategory, fetchItems]);

  return (
    <>
      <div className="kb-toolbar">
        <div className="kb-search">
          <svg className="kb-search__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10 10l3.5 3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="kb-search__input"
            placeholder="Semantisch zoeken…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Zoek in kennisbank"
          />
          {loading && <span className="kb-search__spinner" aria-label="Laden" />}
        </div>

        <Link href="/nieuw" className="btn-primary-sm">
          + Nieuw item
        </Link>
      </div>

      {categories.length > 0 && (
        <div className="kb-filters" role="tablist" aria-label="Categorie filter">
          <button
            role="tab"
            aria-selected={activeCategory === ''}
            className="filter-chip"
            data-active={activeCategory === '' ? 'true' : undefined}
            onClick={() => setActiveCategory('')}
          >
            Alles
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={activeCategory === cat}
              className="filter-chip"
              data-active={activeCategory === cat ? 'true' : undefined}
              onClick={() => setActiveCategory(cat)}
            >
              <span className="filter-chip__icon" aria-hidden="true">
                <CategoryIcon category={cat} />
              </span>
              {cat}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="api-error-banner">
          <span>{error}</span>
        </div>
      )}

      {!error && items.length === 0 && !loading && (
        <div className="empty-state">
          <p className="empty-state__label">
            {query ? `Geen resultaten voor "${query}"` : 'Niets gevonden'}
          </p>
          <p className="empty-state__heading">Geen kennisitems</p>
          {!query && (
            <Link href="/nieuw" className="btn-ghost-sm">Eerste item toevoegen →</Link>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className={`kennis-list${loading ? ' kennis-list--loading' : ''}`}>
          {items.map((item) => (
            <Link key={item.id} href={`/kennisbank/${item.id}`} className="kennis-row">
              <span className="kennis-row__icon" aria-hidden="true">
                <CategoryIcon category={item.category} />
              </span>
              <span className="kennis-row__body">
                <span className="kennis-row__title">{item.title}</span>
                <span className="kennis-row__excerpt">{item.content.slice(0, 140)}{item.content.length > 140 ? '…' : ''}</span>
              </span>
              <span className="kennis-row__meta">
                <span className="kennis-row__category">{item.category}</span>
                {item.source && (
                  <span className={`source-badge source-badge--${item.source === 'ai' ? 'ai' : 'handmatig'}`}>
                    {item.source === 'ai' ? 'AI' : 'Handmatig'}
                  </span>
                )}
              </span>
              <span className="kennis-row__arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
