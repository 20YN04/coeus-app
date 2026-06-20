const AUTOMATIONS = [
  {
    name: 'E-mail-trigger',
    desc: 'Lees inkomende mail en zet relevante kennis automatisch in de juiste categorie.',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <rect x="2" y="3.5" width="12" height="9" rx="1" />
        <path d="M2.5 4.5l5.5 4 5.5-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: 'Webhook',
    desc: 'Ontvang gebeurtenissen vanuit je eigen tools en laat het brein erop reageren.',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <circle cx="4" cy="11.5" r="2" />
        <circle cx="12" cy="11.5" r="2" />
        <circle cx="8" cy="4" r="2" />
        <path d="M6.5 5.5L4.8 9.6M9.5 5.5l1.7 4.1M6 11.5h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'Geplande taak',
    desc: 'Draai op een vast ritme — een wekelijkse samenvatting, een dagelijkse opschoning.',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4.5V8l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: 'Brein-sync',
    desc: 'Spiegel de lokale kennisbank naar de cloud en deel hem met je team.',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M11.5 5.5a4 4 0 1 0 .9 3" strokeLinecap="round" />
        <path d="M11.5 2.5v3h-3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function AutomatisatiesPage() {
  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Koppelingen</p>
        <h1 className="page-title">Automatisaties</h1>
      </div>

      <div className="automations-layout">
        <section className="automations-intro">
          <p className="automations-intro__lead">
            Hier koppel je automatisaties aan je brein. Triggers vullen de
            kennisbank, syncs delen hem, en geplande taken houden hem schoon —
            zonder dat je een vinger uitsteekt.
          </p>
          <p className="automations-intro__note">
            Automatisaties draaien in de cloud, bovenop je lokale kennisbank.
            Nog niet verbonden.
          </p>
        </section>

        <div className="automation-grid">
          {AUTOMATIONS.map(({ name, desc, icon }) => (
            <article key={name} className="automation-card">
              <div className="automation-card__top">
                <span className="automation-card__icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="automation-card__status">Binnenkort</span>
              </div>
              <h2 className="automation-card__name">{name}</h2>
              <p className="automation-card__desc">{desc}</p>
              <span className="automation-card__wire" aria-hidden="true">
                Niet verbonden
              </span>
            </article>
          ))}
        </div>

        <div className="automations-cta">
          <button type="button" className="btn-ghost-sm" disabled>
            Verbind een automatisatie
          </button>
          <span className="automations-cta__hint">Binnenkort beschikbaar</span>
        </div>
      </div>
    </>
  );
}
