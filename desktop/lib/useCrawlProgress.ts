'use client';

import { useEffect, useState } from 'react';
import { getCrawlStatus, type CrawlJobStatus } from '@/lib/brein';

// Gedeeld door /welkom stap 3 en de Importeren-crawl-mode — dezelfde job kan
// vanaf beide plekken bekeken worden. Polling stopt zodra de job niet meer
// "running" is, faalt, of de gebruiker wegnavigeert (unmount).
const POLL_INTERVAL_MS = 1200;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 min — crawls van 15+ pagina's kunnen traag zijn

// jobId is altijd een echte job (beide callers — /welkom stap 3 en Importeren
// — mounten dit component pas ná een geslaagde ingestCrawlAsync). Geen null-
// tak nodig: dat zou state synchroon in een effect resetten, wat de
// react-hooks/set-state-in-effect-regel afkeurt zonder een echt voordeel.
export function useCrawlProgress(jobId: string) {
  const [status, setStatus] = useState<CrawlJobStatus | null>(null);
  const [pollError, setPollError] = useState('');
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    async function tick() {
      if (!alive) return;
      if (Date.now() - startedAt > TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      try {
        const res = await getCrawlStatus(jobId);
        if (!alive) return;
        setStatus(res);
        setPollError('');
        if (res.status === 'running') {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!alive) return;
        setPollError(err instanceof Error ? err.message : 'poll mislukt');
        // Blijf pollen — een gemiste tick (bv. sidecar tijdelijk traag) mag de
        // wizard niet permanent breken; de globale timeout vangt echte hangs op.
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  return { status, pollError, timedOut };
}
