'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Static export has no server redirects — the Tauri window loads `/`, so we
// bounce to the dashboard client-side. A brand-coloured splash avoids a white
// flash during the (instant) hop.
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return <div className="boot-splash" aria-hidden="true" />;
}
