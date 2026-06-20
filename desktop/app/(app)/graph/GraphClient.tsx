'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { KennisGraph } from '@/lib/brein';

// Coeus-palet: indigo eerst, daarna onderscheidende tinten per categorie.
const PALETTE = [
  '#7C6CFF', '#3A1DD8', '#2DD4BF', '#F59E0B',
  '#EC4899', '#38BDF8', '#A3E635', '#FB7185',
];

const BG = '#0E0833';

// Narrow structurele types voor de force-graph-instanties (alleen wat we gebruiken),
// zodat we geen `any` nodig hebben maar ook niet vastlopen op de generieke lib-typen.
type FGNode = { id: string; x: number; y: number; category: string; title: string };
type FGLink = { source: string | { id?: string }; target: string | { id?: string }; weight: number };

interface FG2DInstance {
  width(n: number): FG2DInstance;
  height(n: number): FG2DInstance;
  backgroundColor(c: string): FG2DInstance;
  graphData(d: { nodes: object[]; links: object[] }): FG2DInstance;
  cooldownTime(ms: number): FG2DInstance;
  nodeId(id: string): FG2DInstance;
  nodeLabel(fn: (n: FGNode) => string): FG2DInstance;
  linkColor(fn: (l: FGLink) => string): FG2DInstance;
  linkWidth(fn: (l: FGLink) => number): FG2DInstance;
  nodeCanvasObjectMode(fn: () => string): FG2DInstance;
  nodeCanvasObject(fn: (n: FGNode, ctx: CanvasRenderingContext2D, scale: number) => void): FG2DInstance;
  nodePointerAreaPaint(fn: (n: FGNode, color: string, ctx: CanvasRenderingContext2D) => void): FG2DInstance;
  onNodeHover(fn: (n: FGNode | null) => void): FG2DInstance;
  onNodeClick(fn: (n: FGNode) => void): FG2DInstance;
  onEngineStop(fn: () => void): FG2DInstance;
  zoomToFit(ms?: number, px?: number): FG2DInstance;
  _destructor(): void;
}

interface FG3DInstance {
  width(n: number): FG3DInstance;
  height(n: number): FG3DInstance;
  backgroundColor(c: string): FG3DInstance;
  graphData(d: { nodes: object[]; links: object[] }): FG3DInstance;
  cooldownTime(ms: number): FG3DInstance;
  nodeId(id: string): FG3DInstance;
  nodeLabel(fn: (n: FGNode) => string): FG3DInstance;
  nodeColor(fn: (n: FGNode) => string): FG3DInstance;
  nodeVal(fn: (n: FGNode) => number): FG3DInstance;
  nodeOpacity(n: number): FG3DInstance;
  nodeResolution(n: number): FG3DInstance;
  linkColor(fn: (l: FGLink) => string): FG3DInstance;
  linkWidth(fn: (l: FGLink) => number): FG3DInstance;
  linkOpacity(n: number): FG3DInstance;
  onNodeHover(fn: (n: FGNode | null) => void): FG3DInstance;
  onNodeClick(fn: (n: FGNode) => void): FG3DInstance;
  zoomToFit(ms?: number, px?: number): FG3DInstance;
  _destructor(): void;
}

// Gedeelde basis voor cleanup/resize, ongeacht 2D of 3D.
type FGCommon = { width(n: number): unknown; height(n: number): unknown; _destructor(): void };

type Mode = '2d' | '3d';
type Props = { graph: KennisGraph; categories: string[] };

export default function GraphClient({ graph, categories }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('2d');

  // Stabiele categorie→kleur map. Val terug op de categorieën in de graph zelf
  // als /categories niets gaf.
  const categoryColors = useMemo(() => {
    const cats =
      categories.length > 0
        ? categories
        : Array.from(new Set(graph.nodes.map((n) => n.category)));
    const map = new Map<string, string>();
    cats.forEach((c, i) => map.set(c, PALETTE[i % PALETTE.length]));
    return map;
  }, [categories, graph.nodes]);

  const colorFor = useCallback(
    (category: string) => categoryColors.get(category) ?? '#9CA3AF',
    [categoryColors],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || graph.nodes.length === 0) return;

    let disposed = false;
    let fg: FGCommon | null = null;
    let onResize: (() => void) | null = null;
    const cleanupTimers: ReturnType<typeof setTimeout>[] = [];

    (async () => {
      // ── Gedeelde dataprep ────────────────────────────────────────
      const data = {
        nodes: graph.nodes.map((n) => ({ ...n })),
        links: graph.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })),
      };

      // Adjacency + graad voor hover-highlight en node-grootte.
      const neighbors = new Map<string, Set<string>>();
      const degree = new Map<string, number>();
      for (const e of graph.edges) {
        if (!neighbors.has(e.source)) neighbors.set(e.source, new Set());
        if (!neighbors.has(e.target)) neighbors.set(e.target, new Set());
        neighbors.get(e.source)!.add(e.target);
        neighbors.get(e.target)!.add(e.source);
        degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
        degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
      }

      const radiusFor = (id: string) => 3 + Math.sqrt(degree.get(id) ?? 0) * 2;
      const valFor = (id: string) => 1 + (degree.get(id) ?? 0);
      const idOf = (end: string | { id?: string }) => (typeof end === 'object' ? end.id : end);

      // ── 3D-pad (three.js, lazy) ──────────────────────────────────
      if (mode === '3d') {
        const ForceGraph3D = (await import('3d-force-graph')).default;
        if (disposed || !containerRef.current) return;
        const container = containerRef.current;

        const g = new ForceGraph3D(container) as unknown as FG3DInstance;
        g
          .width(container.clientWidth)
          .height(container.clientHeight)
          .backgroundColor(BG)
          .cooldownTime(4000)
          .graphData(data)
          .nodeId('id')
          .nodeLabel((n) => n.title)
          .nodeColor((n) => colorFor(n.category))
          .nodeVal((n) => valFor(n.id))
          .nodeOpacity(0.92)
          .nodeResolution(16)
          .linkColor(() => 'rgba(124, 108, 255, 0.5)')
          .linkWidth((l) => 0.3 + l.weight * 1.6)
          .linkOpacity(0.45)
          .onNodeHover((n) => {
            container.style.cursor = n ? 'pointer' : 'grab';
          })
          .onNodeClick((n) => {
            router.push(`/kennisbank/detail?id=${encodeURIComponent(n.id)}`);
          });
        fg = g as unknown as FGCommon;

        const fit = () => g.zoomToFit(600, 80);
        const fitTimer = setTimeout(fit, 1200);
        cleanupTimers.push(fitTimer);

        onResize = () => {
          if (!containerRef.current) return;
          g.width(containerRef.current.clientWidth);
          g.height(containerRef.current.clientHeight);
        };
        window.addEventListener('resize', onResize);
        return;
      }

      // ── 2D-pad (canvas) ──────────────────────────────────────────
      const ForceGraph = (await import('force-graph')).default;
      if (disposed || !containerRef.current) return;
      const container = containerRef.current;

      let hoverId: string | null = null;
      const isLit = (id: string | undefined) =>
        !hoverId || hoverId === id || (!!id && !!neighbors.get(hoverId)?.has(id));

      const g = new ForceGraph(container) as unknown as FG2DInstance;
      g
        .width(container.clientWidth)
        .height(container.clientHeight)
        .backgroundColor(BG)
        .cooldownTime(3000)
        .graphData(data)
        .nodeId('id')
        .nodeLabel((n) => n.title)
        .linkColor((l) => {
          const s = idOf(l.source);
          const t = idOf(l.target);
          const lit = !hoverId || (hoverId === s || hoverId === t);
          return lit ? 'rgba(124, 108, 255, 0.35)' : 'rgba(244, 242, 251, 0.06)';
        })
        .linkWidth((l) => 0.4 + l.weight * 2.5)
        .nodeCanvasObjectMode(() => 'replace')
        .nodeCanvasObject((n, ctx, scale) => {
          const r = radiusFor(n.id);
          const lit = isLit(n.id);
          ctx.globalAlpha = lit ? 1 : 0.18;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = colorFor(n.category);
          ctx.fill();
          if (scale > 1.4 || hoverId === n.id) {
            ctx.font = `${11 / scale}px 'JetBrains Mono', ui-monospace, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#F4F2FB';
            ctx.fillText(n.title, n.x, n.y + r + 3 / scale);
          }
          ctx.globalAlpha = 1;
        })
        .nodePointerAreaPaint((n, color, ctx) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, radiusFor(n.id) + 2, 0, 2 * Math.PI);
          ctx.fill();
        })
        .onNodeHover((n) => {
          hoverId = n ? n.id : null;
          container.style.cursor = n ? 'pointer' : 'grab';
        })
        .onNodeClick((n) => {
          router.push(`/kennisbank/detail?id=${encodeURIComponent(n.id)}`);
        });
      fg = g as unknown as FGCommon;

      // Frame de graph netjes in beeld. De force-simulatie koelt af, dus we
      // fitten zowel via een timer (vroeg, robuust) als bij engine-stop (definitief).
      const fit = () => g.zoomToFit(400, 60);
      g.onEngineStop(fit);
      const fitTimer = setTimeout(fit, 700);
      cleanupTimers.push(fitTimer);

      onResize = () => {
        if (!containerRef.current) return;
        g.width(containerRef.current.clientWidth);
        g.height(containerRef.current.clientHeight);
      };
      window.addEventListener('resize', onResize);
    })();

    return () => {
      disposed = true;
      cleanupTimers.forEach(clearTimeout);
      if (onResize) window.removeEventListener('resize', onResize);
      fg?._destructor();
      if (el) el.innerHTML = '';
    };
  }, [graph, router, colorFor, mode]);

  if (graph.nodes.length === 0) {
    return (
      <div className="graph-empty">
        <p>Nog te weinig kennis om een graph te tekenen.</p>
        <p className="graph-empty__hint">Voeg items toe via Nieuw — de verbanden verschijnen vanzelf.</p>
      </div>
    );
  }

  const legendCats =
    categories.length > 0
      ? categories
      : Array.from(new Set(graph.nodes.map((n) => n.category)));

  return (
    <div className="graph-wrap">
      <div ref={containerRef} className="graph-canvas" />
      <div className="graph-toggle" role="group" aria-label="Weergave 2D of 3D">
        <button
          type="button"
          className={`graph-toggle__btn${mode === '2d' ? ' is-active' : ''}`}
          aria-pressed={mode === '2d'}
          onClick={() => setMode('2d')}
        >
          2D
        </button>
        <button
          type="button"
          className={`graph-toggle__btn${mode === '3d' ? ' is-active' : ''}`}
          aria-pressed={mode === '3d'}
          onClick={() => setMode('3d')}
        >
          3D
        </button>
      </div>
      <div className="graph-legend">
        <span className="graph-legend__title">Categorieën</span>
        {legendCats.map((c) => (
          <span key={c} className="graph-legend__item">
            <span className="graph-legend__dot" style={{ background: colorFor(c) }} />
            {c}
          </span>
        ))}
        <span className="graph-legend__meta">
          {graph.nodes.length} items · {graph.edges.length} verbanden
        </span>
      </div>
    </div>
  );
}
