'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/authContext';
import { useT } from '@/lib/i18n';

// entitlement.status is 'none' or 'canceled' — a real account, no active
// license. Never a crash path: this is the calm dead-end the architecture
// note asks for, with the only way out being sign-out → sign back in once
// the entitlement is activated (comp/Stripe, see coeus-auth /internal/entitlement).
export default function InactiveScreen() {
  const { t } = useT();
  const { account, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    await logout();
  }

  return (
    <div className="auth-screen">
      <div className="auth-shell">
        <div className="auth-header">
          <span className="auth-badge">{t('auth.inactive.badge')}</span>
          <h1 className="auth-title">{t('auth.inactive.title')}</h1>
          <p className="auth-lead">{t('auth.inactive.lead')}</p>
          {account?.email && <p className="auth-lead">{account.email}</p>}
        </div>

        <button
          type="button"
          className="btn-outline"
          onClick={handleLogout}
          disabled={busy}
          aria-busy={busy}
        >
          {t('auth.inactive.logout')}
        </button>
      </div>
    </div>
  );
}
