'use client';

import { useAuth } from '@/lib/authContext';
import InactiveScreen from './InactiveScreen';
import LoginScreen from './LoginScreen';

// Wraps the app-shell subtree (Sidebar + TopBar + page content), passed in
// as `children` from the (app) server-component layout — see the Next.js
// docs "Interleaving Server and Client Components" pattern: the shell is
// still server-rendered, this client component only decides whether to hand
// it to the browser or show the gate instead.
//
// `status === 'disabled'` (NEXT_PUBLIC_AUTH_REQUIRED not "true") always
// renders children immediately — the regression contract for the public
// build. No other branch runs in that case (see lib/authContext.tsx).
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === 'disabled') return <>{children}</>;
  if (status === 'loading') return <div className="boot-splash" aria-hidden="true" />;
  if (status === 'unauthenticated') return <LoginScreen />;
  if (status === 'inactive') return <InactiveScreen />;
  return <>{children}</>;
}
