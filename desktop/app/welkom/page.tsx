'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CrawlProgress from '@/app/components/CrawlProgress';
import { useT } from '@/lib/i18n';
import { WELKOM_LATER_KEY } from '@/lib/welkom';
import WelkomStap1 from './WelkomStap1';
import WelkomStap2 from './WelkomStap2';

// First-run onboarding: verschijnt via app/page.tsx zodra de kennisbank leeg
// is (zie de check daar). Geen eigen "heb ik dit al gezien"-vlag — een lege
// kennisbank ís de trigger, zodat een reset de wizard vanzelf terugbrengt.
// De enige localStorage-state is de "later"-escape in stap 2.
type Step = 1 | 2 | 3;

export default function WelkomPage() {
  const router = useRouter();
  const { t } = useT();
  const [step, setStep] = useState<Step>(1);
  const [job, setJob] = useState<{ id: string; url: string } | null>(null);

  function handleLater() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WELKOM_LATER_KEY, '1');
    }
    router.replace('/dashboard');
  }

  function handleCrawlStarted(jobId: string, url: string) {
    setJob({ id: jobId, url });
    setStep(3);
  }

  return (
    <div className="welkom">
      <div className="welkom-shell">
        <div
          className="welkom-steps"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={3}
          aria-label={t('welkom.stepAriaLabel', { step })}
        >
          {([1, 2, 3] as const).map((n) => (
            <span key={n} className="welkom-steps__dot" data-done={n <= step ? 'true' : undefined} aria-hidden="true" />
          ))}
        </div>

        {step === 1 && <WelkomStap1 onNext={() => setStep(2)} />}
        {step === 2 && (
          <WelkomStap2 onLater={handleLater} onCrawlStarted={handleCrawlStarted} />
        )}
        {step === 3 && job && <CrawlProgress jobId={job.id} sourceUrl={job.url} />}
      </div>
    </div>
  );
}
