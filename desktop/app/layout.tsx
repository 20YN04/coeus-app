import type { Metadata } from 'next';
import { Instrument_Sans } from 'next/font/google';
import './globals.css';
import tenant from '@/config/tenant';
import AutoUpdate from './AutoUpdate';
import { I18nProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: `Kennisbank — ${tenant.name}`,
  description: `De Coeus kennisbank voor ${tenant.name}.`,
};

// Self-hosted at build time (static export → out/_next/static/media), no
// runtime request to fonts.googleapis.com. https://nextjs.org/docs/app/api-reference/components/font
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
});

const DEFAULT_ACCENT = '#1f1fd1';

function hexToRgbTriplet(hex: string): string | null {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (full.length < 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return `${r}, ${g}, ${b}`;
}

// White-label theming: a per-client build sets NEXT_PUBLIC_TENANT_ACCENT. Text
// ink stays neutral regardless of tenant — only the *interactive* accent family
// re-tints (links, active nav, primary actions, the small accent panels). Only
// emit when it's a real, hex colour that differs from the Coeus default;
// hex-only guard prevents CSS injection via the (build-time constant) value.
function accentStyle(): string | null {
  const accent = tenant.accentColor?.trim();
  if (!accent) return null;
  if (accent.toLowerCase() === DEFAULT_ACCENT) return null;
  if (!/^#[0-9a-fA-F]{3,8}$/.test(accent)) return null;
  const rgb = hexToRgbTriplet(accent);
  if (!rgb) return null;
  return [
    ':root{',
    `--c-accent:${accent};`,
    `--c-accent-rgb:${rgb};`,
    `--c-paper-muted:color-mix(in srgb, ${accent} 45%, #ffffff);`,
    '}',
  ].join('');
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const accent = accentStyle();
  return (
    <html lang="nl" className={instrumentSans.variable}>
      <body>
        {accent && <style dangerouslySetInnerHTML={{ __html: accent }} />}
        <I18nProvider>
          {children}
          <AutoUpdate />
        </I18nProvider>
      </body>
    </html>
  );
}
