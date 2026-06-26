'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteKennis } from '@/lib/brein';
import { useT } from '@/lib/i18n';

type Props = {
  id: string;
  title: string;
};

export default function DetailActions({ id, title }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await deleteKennis(id);
      router.push('/kennisbank');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.deleteFailed'));
      setLoading(false);
      setConfirming(false);
    }
  }

  return (
    <div className="delete-action">
      {error && <p className="form-error">{error}</p>}
      {confirming && (
        <p className="delete-confirm-text">
          {t('detail.deleteConfirm', {
            title: title.length > 40 ? title.slice(0, 40) + '…' : title,
          })}
        </p>
      )}
      <button
        className={confirming ? 'btn-danger' : 'btn-ghost'}
        onClick={handleDelete}
        disabled={loading}
        aria-label={confirming ? t('detail.deleteAriaConfirm') : t('detail.deleteAriaDelete')}
      >
        {loading ? t('common.deleting') : confirming ? t('common.confirm') : t('common.delete')}
      </button>
      {confirming && !loading && (
        <button
          className="btn-ghost"
          onClick={() => setConfirming(false)}
        >
          {t('common.cancel')}
        </button>
      )}
    </div>
  );
}
