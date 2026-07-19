'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { KennisGraph } from '@/lib/brein';
import { useT } from '@/lib/i18n';

// De 11-tinten kenniskaart-palet leeft als CSS-custom-properties in
// globals.css (--c-graph-1..11, met een dark-tegenhanger per token) zodat
// licht/donker uit één bron komt. Cat 1 = var(--c-accent), dus ook
// white-label tenant-accent (NEXT_PUBLIC_TENANT_ACCENT) trekt automatisch
// door. Deze fallbacks zijn alleen een vangnet als een var() onverhoopt
// leeg teruggeeft — nooit de bron van waarheid.
const GRAPH_PALETTE_SIZE = 11;
const FALLBACK_PALETTE = [
  '#1F1FD1', '#6A4FE0', '#8347B8', '#2E6DA4', '#12857A', '#1F8F5E',
  '#55607A', '#2A7FA6', '#1E4E8C', '#B0542F', '#9C7A1E',
];

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Rec. 709 relatieve luma van een #rrggbb-hex — dezelfde gewichten als de
// `luminance()`-shaderfunctie die UnrealBloomPass' LuminosityHighPassShader
// gebruikt (three.js ColorManagement.getLuminanceCoefficients). Gebruikt om
// de bloom-threshold tegen de actuele scene-achtergrond te toetsen i.p.v.
// tegen een vaste, op dark-mode getunede constante — zie de 3D-bloom-setup.
function relLuma(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Volgt data-theme (handmatige toggle) én prefers-color-scheme (systeem-modus,
// geen attribuut op <html> — zie lib/theme.tsx). Geeft een teller terug die bij
// elke wissel omhoog gaat, zodat de graph-effect hem als dependency kan nemen
// en een volledige her-render met de nieuwe getComputedStyle-waarden triggert.
function useThemeSignal(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', bump);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', bump);
    };
  }, []);
  return version;
}

// Dubbel gegated: (1) gelezen vóór de eerste 3D-build via de sync-call in het
// effect hieronder, (2) live via de change-listener, die de state — en dus de
// graph-rebuild-dependency — opnieuw zet zodra het OS-voorkeur wijzigt terwijl
// de kaart al open staat.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reduced;
}

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

// Minimale shape van de three.js EffectComposer die 3d-force-graph teruggeeft,
// plus de passes-array waar we onze bloom-pass aan toevoegen.
type ThreePass = { dispose?: () => void };
interface ThreeComposer {
  passes: ThreePass[];
  addPass(pass: ThreePass): void;
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
  linkDirectionalParticles(fn: (l: FGLink) => number): FG3DInstance;
  linkDirectionalParticleSpeed(fn: (l: FGLink) => number): FG3DInstance;
  linkDirectionalParticleWidth(n: number): FG3DInstance;
  linkDirectionalParticleColor(fn: (l: FGLink) => string): FG3DInstance;
  onNodeHover(fn: (n: FGNode | null) => void): FG3DInstance;
  onNodeClick(fn: (n: FGNode) => void): FG3DInstance;
  zoomToFit(ms?: number, px?: number): FG3DInstance;
  postProcessingComposer(): ThreeComposer;
  scene(): { add(obj: unknown): void };
  _destructor(): void;
}

// Gedeelde basis voor cleanup/resize, ongeacht 2D of 3D.
type FGCommon = { width(n: number): unknown; height(n: number): unknown; _destructor(): void };

type Mode = '2d' | '3d';
type Props = { graph: KennisGraph; categories: string[] };

export default function GraphClient({ graph, categories }: Props) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('2d');
  const themeVersion = useThemeSignal();
  const reducedMotion = usePrefersReducedMotion();

  // Stabiele categorie→paletindex map (0..10). Val terug op de categorieën in
  // de graph zelf als /categories niets gaf. De index wordt op twee plekken
  // vertaald naar een kleur: de legenda leest `var(--c-graph-N)` rechtstreeks
  // (auto-themed, geen JS nodig), het canvas/three.js-effect resolvet dezelfde
  // token naar een echte hex via getComputedStyle.
  const categoryIndex = useMemo(() => {
    const cats =
      categories.length > 0
        ? categories
        : Array.from(new Set(graph.nodes.map((n) => n.category)));
    const map = new Map<string, number>();
    cats.forEach((c, i) => map.set(c, i % GRAPH_PALETTE_SIZE));
    return map;
  }, [categories, graph.nodes]);

  const colorVarFor = useCallback(
    (category: string) => `var(--c-graph-${(categoryIndex.get(category) ?? 0) + 1})`,
    [categoryIndex],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || graph.nodes.length === 0) return;

    let disposed = false;
    let fg: FGCommon | null = null;
    let onResize: (() => void) | null = null;
    let extraCleanup: (() => void) | null = null;
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

      // ── Thema-tokens, live gelezen ──────────────────────────────
      // getComputedStyle op <html> resolvet de --c-graph-N var()-keten (ook de
      // white-label tenant-accent injectie in layout.tsx) naar echte hex/rgb-
      // strings — canvas en three.js kunnen geen var() consumeren. Dit draait
      // per effect-run, dus bij elke mode- of thema-wissel opnieuw.
      const paletteHex = Array.from({ length: GRAPH_PALETTE_SIZE }, (_, i) =>
        cssVar(`--c-graph-${i + 1}`, FALLBACK_PALETTE[i]),
      );
      const hexForCategory = (category: string) => paletteHex[categoryIndex.get(category) ?? 0];
      const surfaceHex = cssVar('--c-field-deep', '#EEF0F6');
      const inkHex = cssVar('--c-ink', '#1B1D26');
      const inkRgb = cssVar('--c-ink-rgb', '27, 29, 38');
      const accentHex = cssVar('--c-accent', '#1F1FD1');
      const accentRgb = cssVar('--c-accent-rgb', '31, 31, 209');
      const edgeBase = `rgba(${inkRgb}, 0.16)`;
      const edgeLit = `rgba(${accentRgb}, 0.55)`;

      // 3D-bloom-threshold, getoetst aan de actuele scene-achtergrond i.p.v.
      // een vaste constante — zie de bloom-constructie verderop voor het bug-
      // verhaal (lege 3D-render in light mode).
      const bloomThreshold = Math.min(0.97, Math.max(0.82, relLuma(surfaceHex) + 0.12));

      // ── 3D-pad (three.js, lazy) — rustige node-cluster in de ruimte ──
      if (mode === '3d') {
        const [{ default: ForceGraph3D }, THREE, { UnrealBloomPass }] = await Promise.all([
          import('3d-force-graph'),
          import('three'),
          import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
        ]);
        if (disposed || !containerRef.current) return;
        const container = containerRef.current;

        const g = new ForceGraph3D(container) as unknown as FG3DInstance;
        g
          .width(container.clientWidth)
          .height(container.clientHeight)
          .backgroundColor(surfaceHex)
          .cooldownTime(4000)
          .graphData(data)
          .nodeId('id')
          .nodeLabel((n) => n.title)
          .nodeColor((n) => hexForCategory(n.category))
          .nodeVal((n) => valFor(n.id))
          .nodeOpacity(0.92)
          .nodeResolution(16)
          // Hairline links in dezelfde ink-toon als het 2D-pad — geen apart
          // kleursysteem voor de twee viewmodi.
          .linkColor(() => edgeBase)
          .linkWidth((l) => 0.2 + l.weight * 0.6)
          .linkOpacity(0.45)
          // Zeer spaarzame accent-deeltjes, alleen op de sterkste verbindingen —
          // een hint van datastroom, geen firehose. Volledig uit bij reduced-motion.
          .linkDirectionalParticles((l) => (reducedMotion ? 0 : l.weight > 0.55 ? 1 : 0))
          .linkDirectionalParticleSpeed((l) => 0.0015 + l.weight * 0.002)
          .linkDirectionalParticleWidth(1.1)
          .linkDirectionalParticleColor(() => accentHex)
          .onNodeHover((n) => {
            container.style.cursor = n ? 'pointer' : 'grab';
          })
          .onNodeClick((n) => {
            router.push(`/kennisbank/detail?id=${encodeURIComponent(n.id)}`);
          });
        fg = g as unknown as FGCommon;

        // ── Bloom: hooguit een zachte gloed, geen sci-fi-pop ───────────
        // Threshold was hardcoded 0.82, getuned op de donkere achtergrond
        // (luma ~0.11) — prima daar, maar de lichte surface zit op luma
        // ~0.94: ruim boven 0.82, dus UnrealBloom's highlight-pass zag de
        // volledige achtergrond als "bright", blurde 'm over het hele frame
        // en de additive composite blowde alles uit naar wit — bollen
        // onzichtbaar, paneel leeg. bloomThreshold (hierboven) toetst nu aan
        // de echte surface-luma: in dark ongewijzigd (0.82, blijft de
        // bevestigde look), in light ruim boven de achtergrond (max 0.97) —
        // alleen echte highlights (accent-particles, hover-ring) gloeien nog.
        const composer = g.postProcessingComposer();
        const bloom = new UnrealBloomPass(
          new THREE.Vector2(container.clientWidth, container.clientHeight),
          0.18, // strength — net genoeg om highlights te laten ademen
          0.2, // radius — kleine halo, geen full-frame diffusie
          bloomThreshold,
        );
        composer.addPass(bloom);

        const fit = () => g.zoomToFit(600, 80);
        const fitTimer = setTimeout(fit, 1200);
        cleanupTimers.push(fitTimer);

        onResize = () => {
          if (!containerRef.current) return;
          g.width(containerRef.current.clientWidth);
          g.height(containerRef.current.clientHeight);
          bloom.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        };
        window.addEventListener('resize', onResize);

        // Eigen cleanup bovenop _destructor: dispose bloom.
        extraCleanup = () => {
          bloom.dispose();
        };
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
        .backgroundColor(surfaceHex)
        .cooldownTime(3000)
        .graphData(data)
        .nodeId('id')
        .nodeLabel((n) => n.title)
        .linkColor((l) => {
          const s = idOf(l.source);
          const t = idOf(l.target);
          const lit = !hoverId || (hoverId === s || hoverId === t);
          return lit ? edgeLit : edgeBase;
        })
        .linkWidth((l) => 0.4 + l.weight * 2.5)
        .nodeCanvasObjectMode(() => 'replace')
        .nodeCanvasObject((n, ctx, scale) => {
          const r = radiusFor(n.id);
          const lit = isLit(n.id);
          const hovered = hoverId === n.id;
          ctx.globalAlpha = lit ? 1 : 0.18;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = hexForCategory(n.category);
          ctx.fill();
          // Hover-highlight in het accent: een dunne ring, geen kleurwissel —
          // de categoriekleur van de node blijft leidend.
          if (hovered) {
            ctx.lineWidth = 1.5 / scale;
            ctx.strokeStyle = accentHex;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 2.5 / scale, 0, 2 * Math.PI);
            ctx.stroke();
          }
          if (scale > 1.4 || hovered) {
            ctx.font = `${11 / scale}px 'JetBrains Mono', ui-monospace, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = inkHex;
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
      extraCleanup?.();
      fg?._destructor();
      if (el) el.innerHTML = '';
    };
  }, [graph, router, categoryIndex, mode, themeVersion, reducedMotion]);

  if (graph.nodes.length === 0) {
    return (
      <div className="graph-empty">
        <p>{t('graph.emptyTitle')}</p>
        <p className="graph-empty__hint">{t('graph.emptyHint')}</p>
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
      <div className="graph-toggle" role="group" aria-label={t('graph.toggleAriaLabel')}>
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
        <span className="graph-legend__title">{t('graph.categories')}</span>
        {legendCats.map((c) => (
          <span key={c} className="graph-legend__item">
            <span className="graph-legend__dot" style={{ background: colorVarFor(c) }} />
            {c}
          </span>
        ))}
        <span className="graph-legend__meta">
          {t('graph.stats', { nodes: graph.nodes.length, edges: graph.edges.length })}
        </span>
      </div>
    </div>
  );
}
