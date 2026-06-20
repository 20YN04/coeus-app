'use client';

import { useEffect, useState } from 'react';
import { getGraph, getCategories, waitForBrein, type KennisGraph } from '@/lib/brein';
import GraphClient from './GraphClient';

export default function GraphPage() {
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
        <p className="page-eyebrow">Kennis in kaart</p>
        <h1 className="page-title">Graph</h1>
      </div>

      {apiError && (
        <div className="api-error-banner">
          <span>Kan geen verbinding maken met het brein — controleer of de lokale brein draait.</span>
        </div>
      )}

      {loading && !apiError && (
        <div className="page-loading" role="status">Laden…</div>
      )}

      {!loading && !apiError && <GraphClient graph={graph} categories={categories} />}
    </>
  );
}
