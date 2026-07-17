'use client';

import tenant from '@/config/tenant';
import UpdateCheck from './UpdateCheck';
import DataBeheer from './DataBeheer';
import BackupBeheer from './BackupBeheer';
import Opschonen from './Opschonen';
import AiSleutel from './AiSleutel';
import GekoppeldeMap from './GekoppeldeMap';
import { useT, type Lang } from '@/lib/i18n';

export default function InstellingenPage() {
  const { t, lang, setLang } = useT();

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">{t('instellingen.eyebrow')}</p>
        <h1 className="page-title">{t('instellingen.title')}</h1>
      </div>

      <div className="settings-layout">
        <section className="settings-section">
          <div className="settings-section__header">
            <p className="settings-section__label">{t('instellingen.language.label')}</p>
            <p className="settings-section__desc">{t('instellingen.language.desc')}</p>
          </div>

          <div className="kb-filters" role="tablist" aria-label={t('instellingen.language.label')}>
            {(['nl', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={lang === l}
                className="filter-chip"
                data-active={lang === l ? 'true' : undefined}
                onClick={() => setLang(l)}
              >
                {t(`instellingen.language.${l}`)}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header">
            <p className="settings-section__label">{t('instellingen.tenant.label')}</p>
            <p className="settings-section__desc">
              {t('instellingen.tenant.desc').split('.env.local')[0]}
              <code className="code-inline">.env.local</code>
              {t('instellingen.tenant.desc').split('.env.local')[1]}
            </p>
          </div>

          <div className="config-table">
            <ConfigRow
              label={t('instellingen.tenant.companyName')}
              value={tenant.name}
              envKey="NEXT_PUBLIC_TENANT_NAME"
            />
            <ConfigRow
              label={t('instellingen.tenant.slug')}
              value={tenant.slug}
              envKey="NEXT_PUBLIC_TENANT_SLUG"
            />
            <ConfigRow
              label={t('instellingen.tenant.breinUrl')}
              value={tenant.breinUrl ?? '—'}
              envKey="NEXT_PUBLIC_BREIN_URL"
            />
            <ConfigRow
              label={t('instellingen.tenant.logoUrl')}
              value={tenant.logo ?? '—'}
              envKey="NEXT_PUBLIC_TENANT_LOGO"
            />
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header">
            <p className="settings-section__label">{t('instellingen.branding.label')}</p>
            <p className="settings-section__desc">
              {t('instellingen.branding.desc').split('NEXT_PUBLIC_TENANT_ACCENT')[0]}
              <code className="code-inline">NEXT_PUBLIC_TENANT_ACCENT</code>
              {t('instellingen.branding.desc').split('NEXT_PUBLIC_TENANT_ACCENT')[1]}
            </p>
          </div>

          <div className="config-table">
            <ConfigRow
              label={t('instellingen.branding.primaryColor')}
              value={tenant.accentColor ?? t('instellingen.branding.defaultValue')}
              envKey="NEXT_PUBLIC_TENANT_ACCENT"
            />
          </div>

          {tenant.accentColor ? (
            <div className="accent-preview">
              <div
                className="accent-swatch"
                style={{ background: tenant.accentColor }}
                aria-label={`${t('instellingen.branding.primaryColor')}: ${tenant.accentColor}`}
              />
              <span className="accent-swatch__label">{tenant.accentColor}</span>
            </div>
          ) : (
            <div className="accent-preview">
              <div
                className="accent-swatch"
                style={{ background: '#1F1FD1' }}
                aria-label={t('instellingen.branding.defaultAriaLabel')}
              />
              <span className="accent-swatch__label">
                #1F1FD1 <span className="meta-value--muted">{t('instellingen.branding.defaultSuffix')}</span>
              </span>
            </div>
          )}
        </section>

        <section className="settings-section">
          <div className="settings-section__header">
            <p className="settings-section__label">{t('instellingen.version.label')}</p>
          </div>

          <div className="config-table">
            <ConfigRow label={t('instellingen.version.app')} value={process.env.NEXT_PUBLIC_APP_VERSION ?? '0.4.0'} />
            <ConfigRow label={t('instellingen.version.stack')} value="Next.js 16 · React 19 · Tailwind 4" />
          </div>

          <UpdateCheck />
        </section>

        <AiSleutel />

        <DataBeheer />

        <BackupBeheer />

        <GekoppeldeMap />

        <Opschonen />

        <section className="settings-section">
          <div className="settings-section__header">
            <p className="settings-section__label">{t('instellingen.env.label')}</p>
            <p className="settings-section__desc">
              {t('instellingen.env.desc').split('.env.local')[0]}
              <code className="code-inline">.env.local</code>
              {t('instellingen.env.desc').split('.env.local')[1]}
            </p>
          </div>

          <pre className="env-example">{`NEXT_PUBLIC_TENANT_NAME="Uw Bedrijf"
NEXT_PUBLIC_TENANT_SLUG="uwbedrijf"
NEXT_PUBLIC_TENANT_LOGO="/logo.svg"
NEXT_PUBLIC_TENANT_ACCENT="#C2410C"
NEXT_PUBLIC_TENANT_LANG="nl"

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
