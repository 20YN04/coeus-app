'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { listKennis, searchKennis, getCategories, waitForBrein, type KennisItem } from '@/lib/brein';
import { useT } from '@/lib/i18n';

type Props = {
  initialCategory?: string;
  initialQuery?: string;
};

export default function KennisbankClient({ initialCategory, initialQuery }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [activeCategory, setActiveCategory] = useState(initialCategory ?? '');
  const [items, setItems] = useState<KennisItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wait for the local brein sidecar to boot before the first load.
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    waitForBrein(undefined, ctrl.signal).then((ok) => {
      if (!alive) return;
      setReady(true);
      if (!ok) setError(t('common.breinUnreachableShort'));
    });
    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Categories drive the filter chips — fetched client-side once the brein is up.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    getCategories()
      .then((cats) => {
        if (alive) setCategories(cats);
      })
      .catch(() => {
        /* surfaced via the items fetch below */
      });
    return () => {
      alive = false;
    };
  }, [ready]);

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
        setError(t('errors.connectionFailed'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!ready) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchItems(query, activeCategory);
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [ready, query, activeCategory, fetchItems]);

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
            placeholder={t('kennisbank.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('kennisbank.searchAriaLabel')}
          />
          {loading && <span className="kb-search__spinner" aria-label={t('common.loading')} />}
        </div>

        <Link href="/nieuw" className="btn-primary-sm">
          {t('kennisbank.newItem')}
        </Link>
      </div>

      {categories.length > 0 && (
        <div className="kb-filters" role="tablist" aria-label={t('kennisbank.filterAriaLabel')}>
          <button
            role="tab"
            aria-selected={activeCategory === ''}
            className="filter-chip"
            data-active={activeCategory === '' ? 'true' : undefined}
            onClick={() => setActiveCategory('')}
          >
            {t('kennisbank.filterAll')}
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
            {query ? t('kennisbank.emptyNoResults', { query }) : t('kennisbank.emptyNothingFound')}
          </p>
          <p className="empty-state__heading">{t('kennisbank.emptyHeading')}</p>
          {!query && (
            <Link href="/nieuw" className="btn-ghost-sm">{t('kennisbank.emptyCta')}</Link>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className={`kennis-list${loading ? ' kennis-list--loading' : ''}`}>
          {items.map((item) => (
            <Link key={item.id} href={`/kennisbank/detail?id=${encodeURIComponent(item.id)}`} className="kennis-row">
              <span className="kennis-row__body">
                <span className="kennis-row__title">{item.title}</span>
                <span className="kennis-row__excerpt">{item.content.slice(0, 140)}{item.content.length > 140 ? '…' : ''}</span>
              </span>
              <span className="kennis-row__meta">
                {!activeCategory && <span className="kennis-row__category">{item.category}</span>}
                {item.source === 'ai' && (
                  <span className="source-badge source-badge--ai">{t('common.source.ai')}</span>
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
