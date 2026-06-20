import type { Metadata } from 'next';
import './globals.css';
import tenant from '@/config/tenant';

export const metadata: Metadata = {
  title: `Kennisbank — ${tenant.name}`,
  description: `De Coeus kennisbank voor ${tenant.name}.`,
};

const DEFAULT_ACCENT = '#7a00e6';

// White-label theming: a per-client build sets NEXT_PUBLIC_TENANT_ACCENT. In the
// light theme the brand colour is the *ink/accent* (purple) on an off-white
// field, so re-tint the purple token family — not the field. Only emit when it's
// a real, hex colour that differs from the Coeus default; hex-only guard prevents
// CSS injection via the (build-time constant) value.
function accentStyle(): string | null {
  const accent = tenant.accentColor?.trim();
  if (!accent) return null;
  if (accent.toLowerCase() === DEFAULT_ACCENT) return null;
  if (!/^#[0-9a-fA-F]{3,8}$/.test(accent)) return null;
  return [
    ':root{',
    `--c-ink:${accent};`,
    `--c-paper:${accent};`,
    `--c-ink-muted:color-mix(in srgb, ${accent} 55%, #4a4a4a);`,
    `--c-border:color-mix(in srgb, ${accent} 18%, transparent);`,
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
