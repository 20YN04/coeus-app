'use client';

import { useEffect, useState } from 'react';
import { listKennis, getCategories, waitForBrein, type KennisItem } from '@/lib/brein';
import Link from 'next/link';

const BREIN_URL = process.env.NEXT_PUBLIC_BREIN_URL ?? 'http://127.0.0.1:8765';

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

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function DashboardPage() {
  const [allItems, setAllItems] = useState<KennisItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
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

  const weekStart = startOfWeek();
  const thisWeek = allItems.filter((item) => {
    if (!item.created_at) return false;
    return new Date(item.created_at) >= weekStart;
  });
  const weekAi = thisWeek.filter((i) => i.source === 'ai').length;
  const weekHandmatig = thisWeek.filter((i) => i.source !== 'ai').length;

  const categoryCounts = categories.map((cat) => ({
    name: cat,
    count: allItems.filter((i) => i.category === cat).length,
  }));

  const recent = [...allItems]
    .sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    })
    .slice(0, 6);

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Overzicht</p>
        <h1 className="page-title">Dashboard</h1>
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
        <div className="dashboard-grid">
          <section className="dashboard-section">
            <div className="section-header">
              <p className="section-label">Categorieën</p>
              <span className="section-count">{categories.length}</span>
            </div>

            {categories.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state__label">Nog leeg</p>
                <p className="empty-state__heading">Geen categorieën</p>
              </div>
            ) : (
              <div className="category-list">
                {categoryCounts.map(({ name, count }) => (
                  <Link
                    key={name}
                    href={`/kennisbank?categorie=${encodeURIComponent(name)}`}
                    className="category-row"
                  >
                    <span className="category-row__icon" aria-hidden="true">
                      <CategoryIcon category={name} />
                    </span>
                    <span className="category-row__name">{name}</span>
                    <span className="category-row__count">{count}</span>
                    <span className="category-row__arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <aside className="dashboard-aside">
            <div className="week-card">
              <p className="section-label">Deze week geleerd</p>
              <span className="week-number">{thisWeek.length}</span>
              <p className="week-sub">
                {thisWeek.length === 0
                  ? 'Nog niets toegevoegd'
                  : `${weekAi} via AI · ${weekHandmatig} handmatig`}
              </p>
              <div className="week-bar" aria-hidden="true">
                {thisWeek.length > 0 && (
                  <>
                    <div
                      className="week-bar__ai"
                      style={{ width: `${(weekAi / thisWeek.length) * 100}%` }}
                    />
                    <div
                      className="week-bar__handmatig"
                      style={{ width: `${(weekHandmatig / thisWeek.length) * 100}%` }}
                    />
                  </>
                )}
                {thisWeek.length === 0 && (
                  <div className="week-bar__empty" style={{ width: '100%' }} />
                )}
              </div>
              <div className="week-legend">
                <span className="week-legend__ai">AI</span>
                <span className="week-legend__handmatig">Handmatig</span>
              </div>
            </div>

            <div className="stat-pair">
              <div className="stat-cell">
                <p className="stat-cell__label">Totaal</p>
                <span className="stat-cell__value">{allItems.length}</span>
              </div>
              <div className="stat-cell">
                <p className="stat-cell__label">Categorieën</p>
                <span className="stat-cell__value">{categories.length}</span>
              </div>
            </div>
          </aside>

          <section className="dashboard-section dashboard-section--full">
            <div className="section-header">
              <p className="section-label">Recent toegevoegd</p>
              <Link href="/kennisbank" className="section-link">Alle items →</Link>
            </div>

            {recent.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state__label">Leeg</p>
                <p className="empty-state__heading">Kennisbank leeg</p>
                <Link href="/nieuw" className="btn-ghost-sm">Eerste item toevoegen →</Link>
              </div>
            ) : (
              <div className="recent-list">
                {recent.map((item) => (
                  <Link key={item.id} href={`/kennisbank/detail?id=${encodeURIComponent(item.id)}`} className="recent-row">
                    <span className="recent-row__icon" aria-hidden="true">
                      <CategoryIcon category={item.category} />
                    </span>
                    <span className="recent-row__body">
                      <span className="recent-row__title">{item.title}</span>
                      <span className="recent-row__meta">
                        <span className="recent-row__category">{item.category}</span>
                        {item.source && (
                          <span className={`source-badge source-badge--${item.source === 'ai' ? 'ai' : 'handmatig'}`}>
                            {item.source === 'ai' ? 'AI' : 'Handmatig'}
                          </span>
                        )}
                        {item.created_at && (
                          <span className="recent-row__date">
                            {new Date(item.created_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="recent-row__arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
