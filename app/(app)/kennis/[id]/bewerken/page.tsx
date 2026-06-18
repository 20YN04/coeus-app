import { getKennis } from '@/lib/brein';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import KennisForm from '@/app/(app)/components/KennisForm';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function BewerkenPage({ params }: Props) {
  const { id } = await params;

  let item: Awaited<ReturnType<typeof getKennis>> | null = null;
  try {
    item = await getKennis(id);
  } catch {
    notFound();
  }

  if (!item) notFound();

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/kennisbank" className="breadcrumb-link">Kennisbank</Link>
          <span className="breadcrumb-sep"> / </span>
          <Link href={`/kennisbank/${id}`} className="breadcrumb-link">{item.title}</Link>
          <span className="breadcrumb-sep"> / </span>
          Bewerken
        </p>
        <h1 className="page-title">Bewerken</h1>
      </div>

      <KennisForm mode="edit" item={item} />
    </>
  );
}
