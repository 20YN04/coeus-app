import KennisForm from '@/app/(app)/components/KennisForm';

export default function NieuwPage() {
  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Kennisbank</p>
        <h1 className="page-title">Nieuw item</h1>
      </div>

      <KennisForm mode="create" />
    </>
  );
}
