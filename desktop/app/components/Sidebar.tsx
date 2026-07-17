'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n';

const KLANT_NAV = [
  {
    href: '/dashboard',
    labelKey: 'nav.home',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M2 7.5 8 2l6 5.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.5 6.5V13a.5.5 0 0 0 .5.5h3v-4h2v4h3a.5.5 0 0 0 .5-.5V6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/kennisbank',
    labelKey: 'nav.kennisbank',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M2 3h12M2 6h9M2 9h11M2 12h7" />
      </svg>
    ),
  },
  {
    href: '/overzicht',
    labelKey: 'nav.overzicht',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <rect x="1.5" y="2.5" width="13" height="11" />
        <path d="M1.5 6h13M1.5 9.5h13M6 6v7.5" />
      </svg>
    ),
  },
];

const BEHEER_NAV = [
  {
    href: '/importeren',
    labelKey: 'nav.importeren',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M8 1.5v7M5 6l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 10.5v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/nieuw',
    labelKey: 'nav.nieuw',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M8 2v12M2 8h12" />
      </svg>
    ),
  },
  {
    href: '/graph',
    labelKey: 'nav.graph',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <circle cx="3.5" cy="3.5" r="1.75" />
        <circle cx="12.5" cy="5" r="1.75" />
        <circle cx="7" cy="12.5" r="1.75" />
        <path d="M5 4.3l6 .9M4.6 5.2l2 5.6M8.6 11.6l3-5.2" />
      </svg>
    ),
  },
  {
    href: '/automatisaties',
    labelKey: 'nav.automatisaties',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <circle cx="4" cy="8" r="2" />
        <circle cx="12" cy="8" r="2" />
        <path d="M6 8h4M2 4.5h2M2 11.5h2M12 4.5h2M12 11.5h2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/instellingen',
    labelKey: 'nav.instellingen',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <circle cx="8" cy="8" r="2" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41" />
      </svg>
    ),
  },
];

export default function Sidebar({ tenantName }: { tenantName: string }) {
  const pathname = usePathname();
  const { t, lang, setLang } = useT();

  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="sidebar__wordmark">
        <span className="sidebar__brand-name">Coeus</span>
        <span className="sidebar__tenant-name">{tenantName}</span>
      </Link>

      <nav className="sidebar__nav">
        <div className="sidebar__group">
          {KLANT_NAV.map(({ href, labelKey, icon }) => (
            <Link
              key={href}
              href={href}
              className="sidebar__link sidebar__link--primary"
              data-active={pathname.startsWith(href) ? 'true' : undefined}
            >
              {icon}
              {t(labelKey)}
            </Link>
          ))}
        </div>

        <div className="sidebar__divider">
          <span className="sidebar__divider-label">{t('nav.beheer')}</span>
        </div>

        <div className="sidebar__group sidebar__group--secondary">
          {BEHEER_NAV.map(({ href, labelKey, icon }) => (
            <Link
              key={href}
              href={href}
              className="sidebar__link sidebar__link--secondary"
              data-active={pathname.startsWith(href) ? 'true' : undefined}
            >
              {icon}
              {t(labelKey)}
            </Link>
          ))}
        </div>
      </nav>

      <div className="sidebar__footer">
        <span className="sidebar__footer-mark">
          {t('nav.footerMark')} · v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.4.0'}
        </span>
        <div className="sidebar__lang" role="group" aria-label="Taal / Language">
          <button
            type="button"
            className="sidebar__lang-btn"
            data-active={lang === 'nl' ? 'true' : undefined}
            onClick={() => setLang('nl')}
          >
            NL
          </button>
          <span className="sidebar__lang-sep" aria-hidden="true">·</span>
          <button
            type="button"
            className="sidebar__lang-btn"
            data-active={lang === 'en' ? 'true' : undefined}
            onClick={() => setLang('en')}
          >
            EN
          </button>
        </div>
      </div>
    </aside>
  );
}
