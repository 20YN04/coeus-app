'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listKennis, getCategories, waitForBrein, type KennisItem } from '@/lib/brein';

const BREIN_URL = process.env.NEXT_PUBLIC_BREIN_URL ?? 'http://127.0.0.1:8765';

type SortKey = 'title' | 'category' | 'source' | 'created_at';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Titel' },
  { key: 'category', label: 'Categorie' },
  { key: 'source', label: 'Bron' },
  { key: 'created_at', label: 'Aangemaakt' },
];

function sourceLabel(source?: string): string {
  if (!source) return '—';
  return source === 'ai' ? 'AI' : 'Handmatig';
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// RFC-4180 CSV cell: wrap in quotes and double any embedded quote whenever the
// value carries a comma, quote, or newline. Keeps Excel/Numbers parsing intact.
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(rows: KennisItem[]): string {
  const header = ['Titel', 'Categorie', 'Bron', 'Aangemaakt'];
  const lines = [header.map(csvCell).join(',')];
  for (const item of rows) {
    lines.push(
      [
        csvCell(item.title ?? ''),
        csvCell(item.category ?? ''),
        csvCell(sourceLabel(item.source)),
        csvCell(formatDate(item.created_at)),
      ].join(','),
    );
  }
  // Prepend a BOM so spreadsheet apps detect UTF-8 (é, ë in Dutch titles).
  return '﻿' + lines.join('\r\n');
}

export default function OverzichtPage() {
  const router = useRouter();
  const [allItems, setAllItems] = useState<KennisItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        await waitForBrein(undefined, ctrl.signal);
        const [items, cats] = await Promise.all([listKennis(), getCategories()]);
        if (!alive) return;
        setAllItems(items);
        setCategories(cats);
      } catch {
        if (alive) setApiError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  const filtered = useMemo(
    () => (activeCategory ? allItems.filter((i) => i.category === activeCategory) : allItems),
    [allItems, activeCategory],
  );

  const sorted = useMemo(() => {
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'created_at') {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return (da - db) * factor;
      }
      const av = (
        sortKey === 'source' ? sourceLabel(a.source) : (a[sortKey] ?? '')
      ).toString();
      const bv = (
        sortKey === 'source' ? sourceLabel(b.source) : (b[sortKey] ?? '')
      ).toString();
      return av.localeCompare(bv, 'nl-BE', { sensitivity: 'base' }) * factor;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Dates default newest-first; text columns default A→Z.
      setSortDir(key === 'created_at' ? 'desc' : 'asc');
    }
  }

  function downloadCsv() {
    const blob = new Blob([buildCsv(sorted)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coeus-overzicht.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Tabel-weergave</p>
        <h1 className="page-title">Overzicht</h1>
      </div>

      {apiError && (
        <div className="api-error-banner">
          <span>Brein niet bereikbaar — controleer of de lokale brein draait op {BREIN_URL}</span>
        </div>
      )}

      {loading && !apiError && (
        <div className="page-loading" role="status">Laden…</div>
      )}

      {!loading && !apiError && (
        <div className="ovz">
          <div className="ovz-controls">
            <div className="ovz-controls__left">
              {categories.length > 0 && (
                <div className="ovz-filter">
                  <label className="ovz-filter__label" htmlFor="ovz-cat">Categorie</label>
                  <div className="ovz-select">
                    <select
                      id="ovz-cat"
                      className="ovz-select__input"
                      value={activeCategory}
                      onChange={(e) => setActiveCategory(e.target.value)}
                    >
                      <option value="">Alle categorieën</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <svg className="ovz-select__chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              )}
              <span className="ovz-count">
                {sorted.length} {sorted.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <div className="ovz-controls__right">
              <button type="button" className="btn-outline" onClick={downloadCsv} disabled={sorted.length === 0}>
                CSV
              </button>
              <button type="button" className="btn-outline" onClick={() => window.print()} disabled={sorted.length === 0}>
                PDF / Print
              </button>
            </div>
          </div>

          {sorted.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state__label">
                {activeCategory ? `Geen items in "${activeCategory}"` : 'Niets gevonden'}
              </p>
              <p className="empty-state__heading">Geen kennisitems</p>
            </div>
          ) : (
            <div className="ovz-table-wrap">
              <table className="ovz-table">
                <caption className="ovz-table__caption">
                  Overzicht kennisbank{activeCategory ? ` — ${activeCategory}` : ''}
                </caption>
                <thead>
                  <tr>
                    {COLUMNS.map(({ key, label }) => {
                      const active = sortKey === key;
                      return (
                        <th key={key} scope="col" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          <button
                            type="button"
                            className="ovz-th__btn"
                            data-active={active ? 'true' : undefined}
                            onClick={() => toggleSort(key)}
                          >
                            {label}
                            <span className="ovz-th__sort" aria-hidden="true">
                              {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((item) => (
                    <tr
                      key={item.id}
                      className="ovz-row"
                      tabIndex={0}
                      role="link"
                      onClick={() => router.push(`/kennisbank/detail?id=${encodeURIComponent(item.id)}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/kennisbank/detail?id=${encodeURIComponent(item.id)}`);
                        }
                      }}
                    >
                      <td className="ovz-cell ovz-cell--title">{item.title}</td>
                      <td className="ovz-cell">
                        <span className="ovz-cell__category">{item.category}</span>
                      </td>
                      <td className="ovz-cell">
                        {item.source ? (
                          <span className={`source-badge source-badge--${item.source === 'ai' ? 'ai' : 'handmatig'}`}>
                            {sourceLabel(item.source)}
                          </span>
                        ) : (
                          <span className="ovz-cell__muted">—</span>
                        )}
                      </td>
                      <td className="ovz-cell ovz-cell--date">{formatDate(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
