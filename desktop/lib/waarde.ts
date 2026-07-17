// Instellingen voor het waarde/ROI-blok (Overzicht → "Wat Coeus je opleverde").
// Alleen lokaal, geen brein-call — zelfde localStorage-patroon als lib/i18n
// (coeus.lang) en lib/welkom.ts (coeus.welkomLater).
export const MINUTES_PER_QUESTION_KEY = 'coeus.waarde.minutenPerVraag';
export const HOURLY_RATE_KEY = 'coeus.waarde.uurloon';

export const DEFAULT_MINUTES_PER_QUESTION = 4;
export const DEFAULT_HOURLY_RATE = 45;

export function readNumberSetting(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function writeNumberSetting(key: string, value: number): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
}
