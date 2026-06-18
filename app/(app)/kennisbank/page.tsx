import { listKennis, getCategories } from '@/lib/brein';
import KennisbankClient from './KennisbankClient';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ categorie?: string }>;
};

export default async function KennisbankPage({ searchParams }: Props) {
  const { categorie } = await searchParams;

  let initialItems: Awaited<ReturnType<typeof listKennis>> = [];
  let categories: string[] = [];
  let apiError = false;

  try {
    [initialItems, categories] = await Promise.all([
      listKennis(categorie),
      getCategories(),
    ]);
  } catch {
    apiError = true;
  }

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Alle kennis</p>
        <h1 className="page-title">Kennisbank</h1>
      </div>

      {apiError && (
        <div className="api-error-banner">
          <span>Kan geen verbinding maken met het brein — controleer of de API bereikbaar is.</span>
        </div>
      )}

      <KennisbankClient
        initialItems={initialItems}
        categories={categories}
        initialCategory={categorie}
        initialApiError={apiError}
      />
    </>
  );
}
