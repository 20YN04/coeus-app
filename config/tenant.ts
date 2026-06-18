export type TenantConfig = {
  name: string;
  slug: string;
  logo?: string;
  accentColor?: string;
  breinUrl?: string;
};

const tenant: TenantConfig = {
  name: process.env.NEXT_PUBLIC_TENANT_NAME ?? 'Demo Bedrijf',
  slug: process.env.NEXT_PUBLIC_TENANT_SLUG ?? 'demo',
  logo: process.env.NEXT_PUBLIC_TENANT_LOGO ?? undefined,
  accentColor: process.env.NEXT_PUBLIC_TENANT_ACCENT ?? undefined,
  breinUrl: process.env.NEXT_PUBLIC_BREIN_URL ?? 'http://localhost:8010',
};

export default tenant;
