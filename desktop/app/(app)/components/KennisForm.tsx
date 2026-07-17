'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { addKennis, updateKennis, getCategories, type KennisItem } from '@/lib/brein';
import { useT } from '@/lib/i18n';

type Props = {
  mode: 'create' | 'edit';
  item?: KennisItem;
  // Voorgevulde titel bij create-mode — komt van het weekrapport ("Beantwoord
  // dit →" linkt hierheen met de onbeantwoorde vraag als titel, zie
  // app/(app)/digest/page.tsx). Genegeerd in edit-mode (item.title wint altijd).
  initialTitle?: string;
};

export default function KennisForm({ mode, item, initialTitle }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [title, setTitle] = useState(item?.title ?? initialTitle ?? '');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveCategory = category === '__custom__' ? customCategory.trim() : category;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !effectiveCategory || !content.trim()) {
      setError(t('kennisForm.errFillFields'));
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
      setError(err instanceof Error ? err.message : t('common.somethingWrong'));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="kennis-form">
      <div className="form-field">
        <label className="form-label" htmlFor="kf-title">
          {t('kennisForm.titleLabel')} <span aria-hidden="true">*</span>
        </label>
        <input
          id="kf-title"
          className="form-input"
          type="text"
          placeholder={t('kennisForm.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={mode === 'create'}
          required
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="kf-category">
          {t('kennisForm.categoryLabel')} <span aria-hidden="true">*</span>
        </label>
        {catLoading ? (
          <div className="form-input form-input--loading">{t('kennisForm.categoryLoading')}</div>
        ) : (
          <select
            id="kf-category"
            className="form-input form-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          >
            {categories.length === 0 && (
              <option value="">{t('kennisForm.categoryChoose')}</option>
            )}
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
            <option value="__custom__">{t('kennisForm.categoryNew')}</option>
          </select>
        )}
        {category === '__custom__' && (
          <input
            className="form-input"
            style={{ marginTop: 'var(--s-2)' }}
            type="text"
            placeholder={t('kennisForm.categoryNewPlaceholder')}
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            autoFocus
          />
        )}
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="kf-content">
          {t('kennisForm.contentLabel')} <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="kf-content"
          className="form-input form-textarea"
          placeholder={t('kennisForm.contentPlaceholder')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          required
        />
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={loading}>
          <span>{loading ? t('kennisForm.submitSaving') : mode === 'edit' ? t('kennisForm.submitEdit') : t('kennisForm.submitCreate')}</span>
          <span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => router.back()}
          disabled={loading}
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
