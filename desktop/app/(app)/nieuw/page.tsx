'use client';

import KennisForm from '@/app/(app)/components/KennisForm';
import { useT } from '@/lib/i18n';

export default function NieuwPage() {
  const { t } = useT();
  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">{t('nieuw.eyebrow')}</p>
        <h1 className="page-title">{t('nieuw.title')}</h1>
      </div>

      <KennisForm mode="create" />
    </>
  );
}
