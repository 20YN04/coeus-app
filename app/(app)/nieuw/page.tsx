'use client';

import { useState } from 'react';
import { addKennis } from '@/lib/brein';
import { useRouter } from 'next/navigation';

export default function NieuwPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !category.trim() || !content.trim()) {
      setError('Vul alle velden in.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const item = await addKennis({ title: title.trim(), category: category.trim(), content: content.trim() });
      router.push(`/kennisbank/${item.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis.');
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">Kennisbank</p>
        <h1 className="page-title">Nieuw item</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: '40rem', display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}>
        <div className="form-field">
          <label className="form-label" htmlFor="title">Titel</label>
          <input
            id="title"
            className="form-input"
            type="text"
            placeholder="Geef een duidelijke titel"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="category">Categorie</label>
          <input
            id="category"
            className="form-input"
            type="text"
            placeholder="bijv. Procedures, Producten, HR"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="content">Inhoud</label>
          <textarea
            id="content"
            className="form-input"
            placeholder="Schrijf de kennisinhoud hier..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            style={{ resize: 'vertical' }}
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={loading}>
          <span>{loading ? 'Opslaan...' : 'Item opslaan'}</span>
          <span>→</span>
        </button>
      </form>
    </>
  );
}
