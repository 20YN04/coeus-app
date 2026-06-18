'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteKennis } from '@/lib/brein';

type Props = {
  id: string;
  title: string;
};

export default function DetailActions({ id, title }: Props) {
  const router = useRouter();
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
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verwijderen mislukt.');
      setLoading(false);
      setConfirming(false);
    }
  }

  return (
    <div className="delete-action">
      {error && <p className="form-error">{error}</p>}
      {confirming && (
        <p className="delete-confirm-text">
          Verwijder &ldquo;{title.length > 40 ? title.slice(0, 40) + '…' : title}&rdquo;? Dit is onomkeerbaar.
        </p>
      )}
      <button
        className={confirming ? 'btn-danger' : 'btn-ghost'}
        onClick={handleDelete}
        disabled={loading}
        aria-label={confirming ? 'Bevestig verwijdering' : 'Verwijder dit item'}
      >
        {loading ? 'Verwijderen…' : confirming ? 'Bevestigen' : 'Verwijderen'}
      </button>
      {confirming && !loading && (
        <button
          className="btn-ghost"
          onClick={() => setConfirming(false)}
        >
          Annuleren
        </button>
      )}
    </div>
  );
}
