import type { Metadata } from 'next';
import './globals.css';
import tenant from '@/config/tenant';

export const metadata: Metadata = {
  title: `Kennisbank — ${tenant.name}`,
  description: `De Coeus kennisbank voor ${tenant.name}.`,
};

const DEFAULT_ACCENT = '#3a1dd8';

// White-label theming: a per-client build sets NEXT_PUBLIC_TENANT_ACCENT, which
// re-tints the indigo token family the whole UI is built on. Only emit the
// override when it's a real, safe colour that differs from the Coeus default —
// the value is a build-time constant set by us, but guard the shape anyway so a
// stray value can't break out of the CSS rule.
function accentStyle(): string | null {
  const accent = tenant.accentColor?.trim();
  if (!accent) return null;
  if (accent.toLowerCase() === DEFAULT_ACCENT) return null;
  if (!/^(#[0-9a-fA-F]{3,8}|rgb\([^)]*\)|hsl\([^)]*\))$/.test(accent)) return null;
  return [
    ':root{',
    `--c-field:${accent};`,
    `--c-field-deep:color-mix(in srgb, ${accent} 65%, #000);`,
    `--c-paper-ink:color-mix(in srgb, ${accent} 88%, #000);`,
    `--c-paper-muted:color-mix(in srgb, ${accent} 60%, #fff);`,
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
    <html lang="nl">
      <body>
        {accent && <style dangerouslySetInnerHTML={{ __html: accent }} />}
        {children}
      </body>
    </html>
  );
}
