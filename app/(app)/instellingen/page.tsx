import tenant from '@/config/tenant';

export default function InstellingenPage() {
  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Systeem</p>
        <h1 className="page-title">Instellingen</h1>
      </div>

      <div style={{ maxWidth: '36rem', display: 'flex', flexDirection: 'column', gap: 'var(--s-8)' }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.625rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--c-ink-muted)',
            margin: 0,
          }}>Tenant</p>

          <ConfigRow label="Naam" value={tenant.name} />
          <ConfigRow label="Slug" value={tenant.slug} />
          <ConfigRow label="Brein API" value={tenant.breinUrl ?? '—'} />
        </section>

        <section style={{ paddingTop: 'var(--s-6)', borderTop: '1px solid var(--c-border)', display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.625rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--c-ink-muted)',
            margin: 0,
          }}>Versie</p>
          <ConfigRow label="App" value="0.1.0" />
          <ConfigRow label="Stack" value="Next.js 16 · React 19 · Tailwind 4" />
        </section>
      </div>
    </>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '10rem 1fr',
      gap: 'var(--s-4)',
      paddingBottom: 'var(--s-3)',
      borderBottom: '1px solid var(--c-border)',
      alignItems: 'baseline',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.5625rem',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--c-ink-muted)',
      }}>{label}</span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8125rem',
        letterSpacing: '0.02em',
        color: 'var(--c-ink)',
      }}>{value}</span>
    </div>
  );
}
