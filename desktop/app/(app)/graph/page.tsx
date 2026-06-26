'use client';

import { useEffect, useState } from 'react';
import { getGraph, getCategories, waitForBrein, type KennisGraph } from '@/lib/brein';
import GraphClient from './GraphClient';
import { useT } from '@/lib/i18n';

export default function GraphPage() {
  const { t } = useT();
  const [graph, setGraph] = useState<KennisGraph>({ nodes: [], edges: [] });
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        await waitForBrein(undefined, ctrl.signal);
        const [g, cats] = await Promise.all([getGraph(), getCategories()]);
        if (!alive) return;
        setGraph(g);
        setCategories(cats);
      } catch {
        if (alive) setApiError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  return (
    <>
      <div className="page-header">
        <p className="page-eyebrow">{t('graph.eyebrow')}</p>
        <h1 className="page-title">{t('graph.title')}</h1>
      </div>

      {apiError && (
        <div className="api-error-banner">
          <span>{t('graph.connectionError')}</span>
        </div>
      )}

      {loading && !apiError && (
        <div className="page-loading" role="status">{t('common.loading')}</div>
      )}

      {!loading && !apiError && <GraphClient graph={graph} categories={categories} />}
    </>
  );
}
