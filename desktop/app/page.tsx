'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { listKennis, waitForBrein } from '@/lib/brein';
import { WELKOM_LATER_KEY } from '@/lib/welkom';

// Static export has no server redirects — the Tauri window loads `/`, so we
// bounce client-side. A brand-coloured splash avoids a white flash during the
// (near-instant) hop.
//
// First-run wizard: an empty knowledge base — not a localStorage flag — is
// the trigger for /welkom, so a reset (or a fresh client install) always
// surfaces it again. The only escape is the explicit "later" click in the
// wizard itself, which we do honour here. Any failure (sidecar not up yet,
// brein unreachable, request error) fails open to /dashboard — the wizard is
// a nicety, never a gate the user can get stuck behind.
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    (async () => {
      const later = typeof window !== 'undefined' && window.localStorage.getItem(WELKOM_LATER_KEY) === '1';
      if (later) {
        if (alive) router.replace('/dashboard');
        return;
      }

      const ok = await waitForBrein(undefined, ctrl.signal);
      if (!alive) return;
      if (!ok) {
        router.replace('/dashboard');
        return;
      }

      try {
        const items = await listKennis();
        if (!alive) return;
        router.replace(items.length === 0 ? '/welkom' : '/dashboard');
      } catch {
        if (alive) router.replace('/dashboard');
      }
    })();

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [router]);

  return <div className="boot-splash" aria-hidden="true" />;
}
