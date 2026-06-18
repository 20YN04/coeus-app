'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { listKennis, searchKennis, type KennisItem } from '@/lib/brein';

const CATEGORY_ICONS: Record<string, string> = {
  procedures: '⟳',
  producten: '◈',
  hr: '◉',
  technisch: '◧',
  klanten: '◎',
  finance: '◫',
  marketing: '◬',
  default: '◆',
};

function categoryIcon(cat: string): string {
  const key = cat.toLowerCase();
  return CATEGORY_ICONS[key] ?? CATEGORY_ICONS.default;
}

type Props = {
  initialItems: KennisItem[];
  categories: string[];
  initialCategory?: string;
};

export default function KennisbankClient({ initialItems, categories, initialCategory }: Props) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(initialCategory ?? '');
  const [items, setItems] = useState<KennisItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetch = useCallback(
    async (q: string, cat: string) => {
      setLoading(true);
      setError('');
      try {
        const result = q.trim()
          ? await searchKennis(q.trim(), { category: cat || undefined })
          : await listKennis(cat || undefined);
        setItems(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fout bij ophalen items.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(query, activeCategory);
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeCategory, fetch]);

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
              {categoryIcon(cat)}&nbsp;{cat}
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
        <div className="kennis-list">
          {items.map((item) => (
            <Link key={item.id} href={`/kennisbank/${item.id}`} className="kennis-row">
              <span className="kennis-row__icon" aria-hidden="true">
                {categoryIcon(item.category)}
              </span>
              <span className="kennis-row__body">
                <span className="kennis-row__title">{item.title}</span>
                <span className="kennis-row__excerpt">{item.content.slice(0, 140)}{item.content.length > 140 ? '…' : ''}</span>
              </span>
              <span className="kennis-row__meta">
                <span className="kennis-row__category">{item.category}</span>
                {item.source && (
                  <span className={`source-badge source-badge--${item.source === 'ai' ? 'ai' : 'handmatig'}`}>
                    {item.source === 'ai' ? '🤖' : '✍'}
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
