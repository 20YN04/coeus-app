import type { Metadata } from 'next';
import './globals.css';
import tenant from '@/config/tenant';

export const metadata: Metadata = {
  title: `Kennisbank — ${tenant.name}`,
  description: `De Coeus kennisbank voor ${tenant.name}.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
