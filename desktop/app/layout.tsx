import type { Metadata } from 'next';
import Script from 'next/script';
import { Instrument_Sans, Fraunces } from 'next/font/google';
import './globals.css';
import tenant from '@/config/tenant';
import AutoUpdate from './AutoUpdate';
import { I18nProvider } from '@/lib/i18n';
import { AuthProvider } from '@/lib/authContext';
import { ThemeProvider } from '@/lib/theme';

export const metadata: Metadata = {
  title: `Kennisbank — ${tenant.name}`,
  description: `De Coeus kennisbank voor ${tenant.name}.`,
};

// Reads the manually-stored theme choice (coeus.theme = light|dark, written
// by lib/theme.tsx) and stamps data-theme on <html> before first paint.
// "system" (or nothing stored) intentionally stamps nothing — the
// prefers-color-scheme block in globals.css decides, no JS involved either
// way, so there's no flash for the default path. `beforeInteractive` is the
// Next.js Script strategy documented for scripts that must run before
// hydration/any page module — https://nextjs.org/docs/app/api-reference/components/script
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('coeus.theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

// Self-hosted at build time (static export → out/_next/static/media), no
// runtime request to fonts.googleapis.com. https://nextjs.org/docs/app/api-reference/components/font
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
});

// Variable weight + the opsz axis: one self-hosted file covers everything
// from the display hero down to the small sidebar wordmark, via the
// browser's default `font-optical-sizing: auto` — high-contrast display
// forms at large sizes, sturdier text forms at small sizes, no manual
// weight-swap needed. Same build-time self-hosting as Instrument Sans above.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  style: ['normal', 'italic'],
  axes: ['opsz'],
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

// WCAG relative luminance (gamma-corrected) — the actual perceptual measure,
// not the naive Rec.709 weighted average GraphClient.tsx uses for its bloom
// threshold. Contrast math needs the real one.
function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
function relLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

// The app's own dark accent (#8B93FF) is #1F1FD1 lifted toward white until
// it clears AA on the near-black dark field (see the ratio table in
// globals.css). This is that same colour's luminance — the target a custom
// tenant accent gets lifted toward, so white-label dark mode gets the same
// "opheldering" instead of silently falling back to the Coeus default.
const DARK_ACCENT_TARGET_LUMINANCE = relLuminance(139, 147, 255);

// Mixes toward white in sRGB channel space (same space CSS color-mix(in
// srgb, ...) uses elsewhere in this file) via binary search — gamma makes
// the luminance/mix relationship non-linear, so there's no closed form.
// Clamped to [0.1, 0.9]: a floor so an already-light tenant colour still
// gets a visible dark-mode lift, a ceiling so a near-black one keeps its
// hue instead of washing out to grey-white.
function lightenForDark(r: number, g: number, b: number): [number, number, number] {
  const mixAt = (t: number): [number, number, number] => [
    r + (255 - r) * t,
    g + (255 - g) * t,
    b + (255 - b) * t,
  ];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const [mr, mg, mb] = mixAt(mid);
    if (relLuminance(mr, mg, mb) < DARK_ACCENT_TARGET_LUMINANCE) lo = mid;
    else hi = mid;
  }
  const t = Math.min(0.9, Math.max(0.1, hi));
  const [mr, mg, mb] = mixAt(t);
  return [Math.round(mr), Math.round(mg), Math.round(mb)];
}

// White-label theming: a per-client build sets NEXT_PUBLIC_TENANT_ACCENT. Text
// ink stays neutral regardless of tenant — only the *interactive* accent family
// re-tints (links, active nav, primary actions, the small accent panels). Only
// emit when it's a real, hex colour that differs from the Coeus default;
// hex-only guard prevents CSS injection via the (build-time constant) value.
// The light value is used verbatim; the dark-mode blocks below carry a
// luma-lifted variant so the accent stays legible/AA on the dark field
// instead of the plain :root injection getting outranked by globals.css's
// higher-specificity dark selectors and silently reverting to the default.
function accentStyle(): string | null {
  const accent = tenant.accentColor?.trim();
  if (!accent) return null;
  if (accent.toLowerCase() === DEFAULT_ACCENT) return null;
  if (!/^#[0-9a-fA-F]{3,8}$/.test(accent)) return null;
  const rgb = hexToRgbTriplet(accent);
  if (!rgb) return null;
  const [r, g, b] = rgb.split(',').map((n) => parseInt(n, 10));
  const [dr, dg, db] = lightenForDark(r, g, b);
  const darkColor = `rgb(${dr}, ${dg}, ${db})`;
  const darkRgb = `${dr}, ${dg}, ${db}`;
  return [
    ':root{',
    `--c-accent:${accent};`,
    `--c-accent-rgb:${rgb};`,
    `--c-paper-muted:color-mix(in srgb, ${accent} 45%, #ffffff);`,
    '}',
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){',
    `--c-accent:${darkColor};`,
    `--c-accent-rgb:${darkRgb};`,
    `--c-paper-muted:color-mix(in srgb, ${darkColor} 45%, #ffffff);`,
    '}}',
    ':root[data-theme="dark"]{',
    `--c-accent:${darkColor};`,
    `--c-accent-rgb:${darkRgb};`,
    `--c-paper-muted:color-mix(in srgb, ${darkColor} 45%, #ffffff);`,
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
    <html lang="nl" className={`${instrumentSans.variable} ${fraunces.variable}`}>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        {accent && <style dangerouslySetInnerHTML={{ __html: accent }} />}
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>{children}</AuthProvider>
            <AutoUpdate />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
