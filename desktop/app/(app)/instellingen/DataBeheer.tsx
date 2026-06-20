'use client';

import { useRef, useState } from 'react';
import { listKennis, addKennis, type KennisCreateInput } from '@/lib/brein';

type ExportPhase =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; count: number }
  | { kind: 'error'; message: string };

type ImportPhase =
  | { kind: 'idle' }
  | { kind: 'busy'; done: number; total: number }
  | { kind: 'done'; imported: number; skipped: number }
  | { kind: 'error'; message: string };

const EXPORT_FILENAME = 'coeus-kennisbank-export.json';

// Trust the file's shape only as far as the brein needs it: title + content are
// required, the rest is optional. Anything that fails this is skipped, never
// half-imported.
function toCreateInput(raw: unknown): KennisCreateInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  const content = typeof r.content === 'string' ? r.content.trim() : '';
  if (!title || !content) return null;

  const input: KennisCreateInput = {
    title,
    content,
    category: typeof r.category === 'string' && r.category ? r.category : 'Algemeen',
  };
  if (typeof r.source === 'string' && r.source) input.source = r.source;
  if (typeof r.source_detail === 'string' && r.source_detail) {
    input.source_detail = r.source_detail;
  }
  return input;
}

export default function DataBeheer() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportPhase, setExportPhase] = useState<ExportPhase>({ kind: 'idle' });
  const [importPhase, setImportPhase] = useState<ImportPhase>({ kind: 'idle' });

  async function handleExport() {
    setExportPhase({ kind: 'busy' });
    try {
      const items = await listKennis();
      const blob = new Blob([JSON.stringify(items, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = EXPORT_FILENAME;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportPhase({ kind: 'done', count: items.length });
    } catch (e) {
      setExportPhase({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Exporteren mislukt.',
      });
    }
  }

  function openImportPicker() {
    fileRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;

    let entries: unknown[];
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error('Het bestand bevat geen lijst met kennis-items.');
      }
      entries = parsed;
    } catch (err) {
      setImportPhase({
        kind: 'error',
        message:
          err instanceof Error ? err.message : 'Het bestand kon niet gelezen worden.',
      });
      return;
    }

    const proceed = window.confirm(
      `Dit voegt ${entries.length} item(s) toe aan de huidige kennisbank. ` +
        'Bestaande items blijven staan. Doorgaan?',
    );
    if (!proceed) return;

    let imported = 0;
    let skipped = 0;
    setImportPhase({ kind: 'busy', done: 0, total: entries.length });

    for (let i = 0; i < entries.length; i++) {
      const input = toCreateInput(entries[i]);
      if (!input) {
        skipped++;
      } else {
        try {
          await addKennis(input);
          imported++;
        } catch {
          skipped++;
        }
      }
      setImportPhase({ kind: 'busy', done: i + 1, total: entries.length });
    }

    setImportPhase({ kind: 'done', imported, skipped });
  }

  const exportBusy = exportPhase.kind === 'busy';
  const importBusy = importPhase.kind === 'busy';

  return (
    <section className="settings-section">
      <div className="settings-section__header">
        <p className="settings-section__label">Back-up &amp; migratie</p>
        <p className="settings-section__desc">
          Exporteer de volledige kennisbank naar één JSON-bestand als back-up, of
          importeer hem op een nieuwe machine. Gebruik dit bij een laptop-wissel of
          een overstap van lokaal naar de cloud. Alles draait lokaal — er gaat niets
          naar buiten.
        </p>
      </div>

      <div className="data-beheer">
        <div className="data-beheer__action">
          <button
            className="btn-outline"
            onClick={handleExport}
            disabled={exportBusy}
            aria-busy={exportBusy}
          >
            {exportBusy ? 'Exporteren…' : 'Exporteer kennisbank'}
          </button>
          {exportPhase.kind === 'done' && (
            <p className="update-check__status update-check__status--ok">
              {exportPhase.count} item(s) geëxporteerd naar {EXPORT_FILENAME}.
            </p>
          )}
          {exportPhase.kind === 'error' && (
            <p className="update-check__status update-check__status--error">
              {exportPhase.message}
            </p>
          )}
        </div>

        <div className="data-beheer__action">
          <button
            className="btn-outline"
            onClick={openImportPicker}
            disabled={importBusy}
            aria-busy={importBusy}
          >
            {importBusy ? 'Importeren…' : 'Importeer kennisbank'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            className="data-beheer__file"
            tabIndex={-1}
            aria-hidden="true"
          />
          {importPhase.kind === 'busy' && (
            <p className="update-check__status">
              Importeren… {importPhase.done} / {importPhase.total}
            </p>
          )}
          {importPhase.kind === 'done' && (
            <p className="update-check__status update-check__status--ok">
              {importPhase.imported} geïmporteerd, {importPhase.skipped} overgeslagen.
            </p>
          )}
          {importPhase.kind === 'error' && (
            <p className="update-check__status update-check__status--error">
              {importPhase.message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
