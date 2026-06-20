'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { addKennis, updateKennis, getCategories, type KennisItem } from '@/lib/brein';

type Props = {
  mode: 'create' | 'edit';
  item?: KennisItem;
};

export default function KennisForm({ mode, item }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [customCategory, setCustomCategory] = useState('');
  const [content, setContent] = useState(item?.content ?? '');
  const [categories, setCategories] = useState<string[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getCategories()
      .then((cats) => {
        setCategories(cats);
        if (!item && cats.length > 0 && !category) {
          setCategory(cats[0]);
        }
      })
      .catch(() => setCategories([]))
      .finally(() => setCatLoading(false));
  }, []);

  const effectiveCategory = category === '__custom__' ? customCategory.trim() : category;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !effectiveCategory || !content.trim()) {
      setError('Vul alle verplichte velden in.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (mode === 'edit' && item) {
        await updateKennis(item.id, {
          title: title.trim(),
          category: effectiveCategory,
          content: content.trim(),
        });
        router.push(`/kennisbank/detail?id=${encodeURIComponent(item.id)}`);
      } else {
        const created = await addKennis({
          title: title.trim(),
          category: effectiveCategory,
          content: content.trim(),
        });
        router.push(`/kennisbank/detail?id=${encodeURIComponent(created.id)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="kennis-form">
      <div className="form-field">
        <label className="form-label" htmlFor="kf-title">
          Titel <span aria-hidden="true">*</span>
        </label>
        <input
          id="kf-title"
          className="form-input"
          type="text"
          placeholder="Duidelijke, beschrijvende titel"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={mode === 'create'}
          required
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="kf-category">
          Categorie <span aria-hidden="true">*</span>
        </label>
        {catLoading ? (
          <div className="form-input form-input--loading">Categorieën laden…</div>
        ) : (
          <select
            id="kf-category"
            className="form-input form-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          >
            {categories.length === 0 && (
              <option value="">Kies een categorie</option>
            )}
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
            <option value="__custom__">+ Nieuwe categorie…</option>
          </select>
        )}
        {category === '__custom__' && (
          <input
            className="form-input"
            style={{ marginTop: 'var(--s-2)' }}
            type="text"
            placeholder="Naam van nieuwe categorie"
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            autoFocus
          />
        )}
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="kf-content">
          Inhoud <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="kf-content"
          className="form-input form-textarea"
          placeholder="Schrijf hier de kennisinhoud…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          required
        />
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={loading}>
          <span>{loading ? 'Opslaan…' : mode === 'edit' ? 'Wijzigingen opslaan' : 'Item opslaan'}</span>
          <span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => router.back()}
          disabled={loading}
        >
          Annuleren
        </button>
      </div>
    </form>
  );
}
