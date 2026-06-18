'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { validateCredentials, setSession } from '@/lib/auth';
import tenant from '@/config/tenant';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    await new Promise((r) => setTimeout(r, 320));

    if (validateCredentials(email.trim(), password)) {
      setSession();
      router.push('/dashboard');
      router.refresh();
    } else {
      setError('Ongeldig e-mailadres of wachtwoord.');
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <p className="login-eyebrow">Coeus Kennisbank</p>
          <h1 className="login-wordmark">{tenant.name}</h1>
          <p className="login-tenant-name">Toegang tot de bedrijfskennisbank</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label className="form-label" htmlFor="email">E-mailadres</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="naam@bedrijf.be"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="password">Wachtwoord</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            <span>{loading ? 'Aanmelden...' : 'Aanmelden'}</span>
            <span>→</span>
          </button>
        </form>
      </div>
    </div>
  );
}
