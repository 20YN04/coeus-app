'use client';

import { useState } from 'react';
import {
  cleanupPreview,
  cleanupApply,
  waitForBrein,
  type CleanupPreview,
} from '@/lib/brein';
import { useT } from '@/lib/i18n';

type ScanPhase =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; preview: CleanupPreview }
  | { kind: 'error'; message: string };

type ApplyPhase =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; removed: number }
  | { kind: 'error'; message: string };

// Hoeveel voorbeeld-titels per groep we tonen voordat we "+ N meer" afkappen.
const SAMPLE_LIMIT = 3;

export default function Opschonen() {
  const { t } = useT();
  const [scan, setScan] = useState<ScanPhase>({ kind: 'idle' });
  const [apply, setApply] = useState<ApplyPhase>({ kind: 'idle' });

  async function handleScan() {
    setScan({ kind: 'busy' });
    setApply({ kind: 'idle' });
    try {
      // Het brein kan nog aan het opstarten zijn (ChromaDB + embeddingmodel).
      await waitForBrein();
      const preview = await cleanupPreview();
      setScan({ kind: 'done', preview });
    } catch (e) {
      setScan({
        kind: 'error',
        message: e instanceof Error ? e.message : t('instellingen.cleanup.scanFailed'),
      });
    }
  }

  async function handleApply() {
    if (scan.kind !== 'done' || scan.preview.duplicaten === 0) return;
    const proceed = window.confirm(
      t('instellingen.cleanup.removeConfirm', {
        duplicates: scan.preview.duplicaten,
        groups: scan.preview.groepen,
      }),
    );
    if (!proceed) return;

    setApply({ kind: 'busy' });
    try {
      const { verwijderd } = await cleanupApply();
      setApply({ kind: 'done', removed: verwijderd });
      // Voorkom dat de oude telling blijft staan na verwijderen.
      setScan({ kind: 'idle' });
    } catch (e) {
      setApply({
        kind: 'error',
        message: e instanceof Error ? e.message : t('instellingen.cleanup.removeFailed'),
      });
    }
  }

  const scanBusy = scan.kind === 'busy';
  const applyBusy = apply.kind === 'busy';
  const hasDuplicates = scan.kind === 'done' && scan.preview.duplicaten > 0;

  return (
    <section className="settings-section">
      <div className="settings-section__header">
        <p className="settings-section__label">{t('instellingen.cleanup.label')}</p>
        <p className="settings-section__desc">{t('instellingen.cleanup.desc')}</p>
      </div>

      <div className="data-beheer">
        <div className="data-beheer__action">
          <button
            className="btn-outline"
            onClick={handleScan}
            disabled={scanBusy}
            aria-busy={scanBusy}
          >
            {scanBusy ? t('instellingen.cleanup.scanning') : t('instellingen.cleanup.scanBtn')}
          </button>

          {scan.kind === 'done' && scan.preview.duplicaten === 0 && (
            <p className="update-check__status update-check__status--ok">
              {t('instellingen.cleanup.noneFound')}
            </p>
          )}
          {hasDuplicates && (
            <p className="update-check__status">
              {t('instellingen.cleanup.found', {
                duplicates: scan.preview.duplicaten,
                groups: scan.preview.groepen,
              })}
            </p>
          )}
          {scan.kind === 'error' && (
            <p className="update-check__status update-check__status--error">
              {scan.message}
            </p>
          )}
        </div>

        {hasDuplicates && (
          <ul className="opschonen-clusters">
            {scan.preview.clusters.map((c, i) => {
              const extra = c.remove.length - SAMPLE_LIMIT;
              return (
                <li key={i} className="opschonen-cluster">
                  <span className="opschonen-cluster__keep">{c.keep}</span>
                  <span className="opschonen-cluster__remove">
                    {c.remove.slice(0, SAMPLE_LIMIT).join(', ')}
                    {extra > 0 ? ` ${t('instellingen.cleanup.moreLabel', { count: extra })}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {hasDuplicates && (
          <div className="data-beheer__action">
            <button
              className="btn-outline"
              onClick={handleApply}
              disabled={applyBusy}
              aria-busy={applyBusy}
            >
              {applyBusy ? t('instellingen.cleanup.removing') : t('instellingen.cleanup.removeBtn')}
            </button>
            {apply.kind === 'error' && (
              <p className="update-check__status update-check__status--error">
                {apply.message}
              </p>
            )}
          </div>
        )}

        {apply.kind === 'done' && (
          <p className="update-check__status update-check__status--ok">
            {t('instellingen.cleanup.removed', { count: apply.removed })}
          </p>
        )}
      </div>
    </section>
  );
}
