import tenant from '@/config/tenant';
import UpdateCheck from './UpdateCheck';

export default function InstellingenPage() {
  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Systeem</p>
        <h1 className="page-title">Instellingen</h1>
      </div>

      <div className="settings-layout">
        <section className="settings-section">
          <div className="settings-section__header">
            <p className="settings-section__label">Tenant</p>
            <p className="settings-section__desc">
              Per-deploy configuratie via omgevingsvariabelen. Pas de waarden aan in je <code className="code-inline">.env.local</code> of hosting-dashboard.
            </p>
          </div>

          <div className="config-table">
            <ConfigRow
              label="Bedrijfsnaam"
              value={tenant.name}
              envKey="NEXT_PUBLIC_TENANT_NAME"
            />
            <ConfigRow
              label="Tenant slug"
              value={tenant.slug}
              envKey="NEXT_PUBLIC_TENANT_SLUG"
            />
            <ConfigRow
              label="Brein API URL"
              value={tenant.breinUrl ?? '—'}
              envKey="NEXT_PUBLIC_BREIN_URL"
            />
            <ConfigRow
              label="Logo URL"
              value={tenant.logo ?? '—'}
              envKey="NEXT_PUBLIC_TENANT_LOGO"
            />
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header">
            <p className="settings-section__label">Huisstijl</p>
            <p className="settings-section__desc">
              White-label theming. Stel de primaire kleur in via <code className="code-inline">NEXT_PUBLIC_TENANT_ACCENT</code>. De rest van de Coeus tokens blijven intact.
            </p>
          </div>

          <div className="config-table">
            <ConfigRow
              label="Primaire kleur"
              value={tenant.accentColor ?? 'Standaard (#7A00E6)'}
              envKey="NEXT_PUBLIC_TENANT_ACCENT"
            />
          </div>

          {tenant.accentColor ? (
            <div className="accent-preview">
              <div
                className="accent-swatch"
                style={{ background: tenant.accentColor }}
                aria-label={`Accent kleur: ${tenant.accentColor}`}
              />
              <span className="accent-swatch__label">{tenant.accentColor}</span>
            </div>
          ) : (
            <div className="accent-preview">
              <div
                className="accent-swatch"
                style={{ background: '#7A00E6' }}
                aria-label="Standaard Coeus blauw"
              />
              <span className="accent-swatch__label">
                #7A00E6 <span className="meta-value--muted">(standaard)</span>
              </span>
            </div>
          )}
        </section>

        <section className="settings-section">
          <div className="settings-section__header">
            <p className="settings-section__label">Versie</p>
          </div>

          <div className="config-table">
            <ConfigRow label="App" value="0.1.0" />
            <ConfigRow label="Stack" value="Next.js 16 · React 19 · Tailwind 4" />
          </div>

          <UpdateCheck />
        </section>

        <section className="settings-section">
          <div className="settings-section__header">
            <p className="settings-section__label">Omgevingsvariabelen — voorbeeld</p>
            <p className="settings-section__desc">
              Plak dit in je <code className="code-inline">.env.local</code> en herstart de dev-server.
            </p>
          </div>

          <pre className="env-example">{`NEXT_PUBLIC_TENANT_NAME="Uw Bedrijf"
NEXT_PUBLIC_TENANT_SLUG="uwbedrijf"
NEXT_PUBLIC_TENANT_LOGO="/logo.svg"
NEXT_PUBLIC_TENANT_ACCENT="#C2410C"

# Lokale brein-sidecar (loopback) — bewerk dit zelden.
NEXT_PUBLIC_BREIN_URL="http://127.0.0.1:8765"`}</pre>
        </section>
      </div>
    </>
  );
}

function ConfigRow({
  label,
  value,
  envKey,
}: {
  label: string;
  value: string;
  envKey?: string;
}) {
  return (
    <div className="config-row">
      <div className="config-row__label-block">
        <span className="config-row__label">{label}</span>
        {envKey && <code className="config-row__env">{envKey}</code>}
      </div>
      <span className="config-row__value">{value}</span>
    </div>
  );
}
