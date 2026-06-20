'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <rect x="1.5" y="1.5" width="5" height="5" />
        <rect x="9.5" y="1.5" width="5" height="5" />
        <rect x="1.5" y="9.5" width="5" height="5" />
        <rect x="9.5" y="9.5" width="5" height="5" />
      </svg>
    ),
  },
  {
    href: '/kennisbank',
    label: 'Kennisbank',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M2 3h12M2 6h9M2 9h11M2 12h7" />
      </svg>
    ),
  },
  {
    href: '/graph',
    label: 'Graph',
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
    href: '/nieuw',
    label: 'Nieuw',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M8 2v12M2 8h12" />
      </svg>
    ),
  },
  {
    href: '/instellingen',
    label: 'Instellingen',
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

  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="sidebar__wordmark">
        <span className="sidebar__brand-name">Coeus</span>
        <span className="sidebar__tenant-name">{tenantName}</span>
      </Link>

      <nav className="sidebar__nav">
        {NAV.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className="sidebar__link"
            data-active={pathname.startsWith(href) ? 'true' : undefined}
          >
            {icon}
            {label}
          </Link>
        ))}
      </nav>

      <div className="sidebar__footer">
        <span className="sidebar__footer-mark">Coeus · lokaal</span>
      </div>
    </aside>
  );
}
