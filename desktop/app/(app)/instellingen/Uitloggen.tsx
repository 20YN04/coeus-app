'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/authContext';
import { useT } from '@/lib/i18n';

// Only rendered by page.tsx when useAuth().required is true — the flag being
// off means there's no session to sign out of, so the section doesn't exist.
export default function Uitloggen() {
  const { t } = useT();
  const { account, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setBusy(true);
    setError(null);
    try {
      await logout();
    } catch {
      setError(t('instellingen.account.logoutFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section">
      <div className="settings-section__header">
        <p className="settings-section__label">{t('instellingen.account.label')}</p>
        <p className="settings-section__desc">{t('instellingen.account.desc')}</p>
      </div>

      <div className="data-beheer__action">
        {account?.email && (
          <p className="update-check__status">
            {t('instellingen.account.loggedInAs', { email: account.email })}
          </p>
        )}

        {error && (
          <p className="update-check__status update-check__status--error">{error}</p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn-outline"
            onClick={handleLogout}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? t('instellingen.account.loggingOut') : t('instellingen.account.logoutBtn')}
          </button>
        </div>
      </div>
    </section>
  );
}
