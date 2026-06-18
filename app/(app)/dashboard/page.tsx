import { listKennis, getCategories } from '@/lib/brein';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

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

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function DashboardPage() {
  let allItems: Awaited<ReturnType<typeof listKennis>> = [];
  let categories: string[] = [];
  let apiError = false;

  try {
    [allItems, categories] = await Promise.all([listKennis(), getCategories()]);
  } catch {
    apiError = true;
  }

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
          <span>Brein niet bereikbaar — controleer of de API draait op {process.env.NEXT_PUBLIC_BREIN_URL ?? 'http://localhost:8010'}</span>
        </div>
      )}

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
                    {categoryIcon(name)}
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
                <Link key={item.id} href={`/kennisbank/${item.id}`} className="recent-row">
                  <span className="recent-row__icon" aria-hidden="true">
                    {categoryIcon(item.category)}
                  </span>
                  <span className="recent-row__body">
                    <span className="recent-row__title">{item.title}</span>
                    <span className="recent-row__meta">
                      <span className="recent-row__category">{item.category}</span>
                      {item.source && (
                        <span className={`source-badge source-badge--${item.source === 'ai' ? 'ai' : 'handmatig'}`}>
                          {item.source === 'ai' ? '🤖 AI' : '✍ Handmatig'}
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
    </>
  );
}
