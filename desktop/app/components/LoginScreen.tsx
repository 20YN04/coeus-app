'use client';

import { useState } from 'react';
import { useAuth, type LoginErrorCode } from '@/lib/authContext';
import { useT } from '@/lib/i18n';

type View = 'login' | 'reset';

function loginErrorKey(code: LoginErrorCode): string {
  switch (code) {
    case 'invalid':
      return 'auth.login.errInvalid';
    case 'unverified':
      return 'auth.login.errUnverified';
    case 'rate_limited':
      return 'auth.login.errRateLimited';
    case 'network':
      return 'auth.login.errNetwork';
    default:
      return 'auth.login.errUnknown';
  }
}

export default function LoginScreen() {
  const { t } = useT();
  const { login, requestPasswordReset } = useAuth();
  const [view, setView] = useState<View>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resetEmail, setResetEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await login(email.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setError(t(loginErrorKey(result.code)));
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetBusy(true);
    const result = await requestPasswordReset(resetEmail.trim());
    setResetBusy(false);
    if (result.ok) {
      setResetSent(true);
    } else {
      setResetError(t('auth.reset.errUnknown'));
    }
  }

  if (view === 'reset') {
    return (
      <div className="auth-screen">
        <div className="auth-shell">
          <div className="auth-header">
            <p className="auth-eyebrow">{t('auth.login.eyebrow')}</p>
            <h1 className="auth-title">{t('auth.reset.title')}</h1>
            <p className="auth-lead">{t('auth.reset.lead')}</p>
          </div>

          {resetSent ? (
            <p className="update-check__status update-check__status--ok">
              {t('auth.reset.sent')}
            </p>
          ) : (
            <form onSubmit={handleReset} className="auth-form">
              <div className="form-field">
                <label className="form-label" htmlFor="reset-email">
                  {t('auth.login.emailLabel')}
                </label>
                <input
                  id="reset-email"
                  className="form-input"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder={t('auth.login.emailPlaceholder')}
                  value={resetEmail}
                  onChange={(ev) => setResetEmail(ev.target.value)}
                />
              </div>

              {resetError && (
                <p className="update-check__status update-check__status--error">
                  {resetError}
                </p>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={resetBusy}
                aria-busy={resetBusy}
              >
                <span>
                  {resetBusy ? t('auth.reset.submitting') : t('auth.reset.submit')}
                </span>
                <span aria-hidden="true">→</span>
              </button>
            </form>
          )}

          <div className="auth-footer">
            <button
              type="button"
              className="auth-link"
              onClick={() => {
                setView('login');
                setResetSent(false);
                setResetError(null);
              }}
            >
              {t('auth.reset.backLink')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-shell">
        <div className="auth-header">
          <p className="auth-eyebrow">{t('auth.login.eyebrow')}</p>
          <h1 className="auth-title">{t('auth.login.title')}</h1>
          <p className="auth-lead">{t('auth.login.lead')}</p>
        </div>

        <form onSubmit={handleLogin} className="auth-form">
          <div className="form-field">
            <label className="form-label" htmlFor="login-email">
              {t('auth.login.emailLabel')}
            </label>
            <input
              id="login-email"
              className="form-input"
              type="email"
              autoComplete="email"
              required
              placeholder={t('auth.login.emailPlaceholder')}
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="login-password">
              {t('auth.login.passwordLabel')}
            </label>
            <input
              id="login-password"
              className="form-input"
              type="password"
              autoComplete="current-password"
              required
              placeholder={t('auth.login.passwordPlaceholder')}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </div>

          {error && (
            <p className="update-check__status update-check__status--error">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={busy}
            aria-busy={busy}
          >
            <span>{busy ? t('auth.login.submitting') : t('auth.login.submit')}</span>
            <span aria-hidden="true">→</span>
          </button>
        </form>

        <div className="auth-footer">
          <button
            type="button"
            className="auth-link"
            onClick={() => setView('reset')}
          >
            {t('auth.login.forgotLink')}
          </button>
        </div>
      </div>
    </div>
  );
}
