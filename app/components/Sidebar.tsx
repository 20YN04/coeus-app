'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession } from '@/lib/auth';

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
  const router = useRouter();

  function handleLogout() {
    clearSession();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="sidebar__wordmark">
        Coeus
        <span>{tenantName}</span>
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
        <button className="sidebar__logout" onClick={handleLogout}>
          Uitloggen
        </button>
      </div>
    </aside>
  );
}
