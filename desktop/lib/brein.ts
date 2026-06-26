const BASE_URL =
  process.env.NEXT_PUBLIC_BREIN_URL ?? 'http://127.0.0.1:8765';

export type KennisItem = {
  id: string;
  title: string;
  category: string;
  content: string;
  source?: 'ai' | 'handmatig' | string;
  source_detail?: string;
  created_at?: string;
  updated_at?: string;
};

export type KennisCreateInput = {
  title: string;
  category: string;
  content: string;
  source?: string;
  source_detail?: string;
};

export type KennisUpdateInput = Partial<KennisCreateInput>;

export type GraphNode = { id: string; title: string; category: string };
export type GraphEdge = { source: string; target: string; weight: number };
export type KennisGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

async function req<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Brein API ${res.status}: ${res.statusText} — ${path}`);
  }
  if (
    res.status === 204 ||
    res.headers.get('content-length') === '0' ||
    !res.headers.get('content-type')?.includes('application/json')
  ) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// The Tauri shell launches the brein sidecar at app start; ChromaDB + the
// embedding model take a few seconds to come up. Poll `/` until it answers so
// the first dashboard/list load survives that boot window instead of flashing
// an error banner. Resolves true once ready, false on timeout (caller then
// surfaces the normal error path).
export async function waitForBrein(
  timeoutMs = 90000,
  signal?: AbortSignal,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) return false;
    try {
      const res = await fetch(`${BASE_URL}/`, { cache: 'no-store', signal });
      if (res.ok) return true;
    } catch {
      if (signal?.aborted) return false;
      /* sidecar not listening yet */
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

export async function listKennis(category?: string): Promise<KennisItem[]> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return req<KennisItem[]>(`/kennis${qs}`);
}

export async function searchKennis(
  q: string,
  opts?: { category?: string; limit?: number },
): Promise<KennisItem[]> {
  const params = new URLSearchParams({ q });
  if (opts?.category) params.set('category', opts.category);
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  return req<KennisItem[]>(`/kennis/search?${params}`);
}

export async function getKennis(id: string): Promise<KennisItem> {
  return req<KennisItem>(`/kennis/${encodeURIComponent(id)}`);
}

export async function addKennis(data: KennisCreateInput): Promise<KennisItem> {
  return req<KennisItem>('/kennis', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateKennis(
  id: string,
  data: KennisUpdateInput,
): Promise<KennisItem> {
  return req<KennisItem>(`/kennis/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteKennis(id: string): Promise<void> {
  await req<unknown>(`/kennis/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// The brein returns categories as objects ([{ name, count }]), not bare strings.
// Map to names (defensive against either shape) so consumers get string[].
export async function getCategories(): Promise<string[]> {
  const cats = await req<Array<{ name: string; count?: number } | string>>('/categories');
  return (cats ?? [])
    .map((c) => (typeof c === 'string' ? c : c?.name))
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

export type IngestResult = { toegevoegd: number };
export type CrawlResult = { toegevoegd: number; paginas: number };
export type FileResult = { toegevoegd: number; bestand: string };

// Onboarding-motor: hak vrije tekst in stukken en sla ze key-free op als
// kennis-items (geen LLM). Geeft het aantal toegevoegde items terug.
export async function ingestText(
  text: string,
  opts?: { category?: string; sourceUrl?: string },
): Promise<IngestResult> {
  return req<IngestResult>('/ingest/text', {
    method: 'POST',
    body: JSON.stringify({
      text,
      category: opts?.category || undefined,
      source_url: opts?.sourceUrl || undefined,
    }),
  });
}

// Onboarding-motor: haal een webpagina server-side op, extraheer leesbare tekst
// en sla die key-free op als kennis-items. Geeft het aantal toegevoegde items terug.
export async function ingestUrl(
  url: string,
  opts?: { category?: string },
): Promise<IngestResult> {
  return req<IngestResult>('/ingest/url', {
    method: 'POST',
    body: JSON.stringify({
      url,
      category: opts?.category || undefined,
    }),
  });
}

// Onboarding-motor: crawl een hele site (BFS, dezelfde host) vanaf een URL,
// extraheer per pagina leesbare tekst en sla die key-free op. Geeft het aantal
// toegevoegde items én het aantal bezochte pagina's terug.
export async function ingestCrawl(
  url: string,
  opts?: { category?: string; maxPages?: number },
): Promise<CrawlResult> {
  return req<CrawlResult>('/ingest/crawl', {
    method: 'POST',
    body: JSON.stringify({
      url,
      category: opts?.category || undefined,
      max_pages: opts?.maxPages || undefined,
    }),
  });
}

// Onboarding-motor: upload een bestand (.pdf / .md / .markdown / .txt), extraheer
// de tekst server-side en sla die key-free op. FormData-upload: géén handmatige
// Content-Type zetten — de browser bepaalt de multipart-boundary zelf (de gedeelde
// `req`-helper forceert application/json, dus hier een eigen fetch).
export async function ingestFile(
  file: File,
  opts?: { category?: string },
): Promise<FileResult> {
  const form = new FormData();
  form.append('file', file);
  if (opts?.category) form.append('category', opts.category);

  const res = await fetch(`${BASE_URL}/ingest/file`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Brein API ${res.status}: ${res.statusText} — /ingest/file`);
  }
  return res.json() as Promise<FileResult>;
}

// AI-laag — /ask en /learn hebben een LLM-key nodig (env óf het lokale
// key-bestand in de data-map, gezet via setLlmKey). Zonder key geeft het brein
// een nette 502/503 terug, die de UI als "AI nog niet geconfigureerd" toont.

export type AskBron = { id?: string; title: string; category: string };
export type AskResult = { antwoord: string; bronnen: AskBron[] };

// Stel een vraag aan de kennisbank: het brein zoekt relevante items en laat de
// LLM daarop een antwoord baseren. Geeft het antwoord + de gebruikte bronnen terug.
// `lang` (nl|en) bepaalt de taal van het antwoord — de UI-taal van de gebruiker.
export async function ask(question: string, lang?: 'nl' | 'en'): Promise<AskResult> {
  return req<AskResult>('/ask', {
    method: 'POST',
    body: JSON.stringify({ question, lang }),
  });
}

export type LearnResult = {
  geleerd: number;
  overgeslagen: number;
  items: KennisItem[];
};

// AI-extractie: laat de LLM gestructureerde kennis uit vrije tekst halen en die
// als kennis-items opslaan (in tegenstelling tot ingestText, dat key-free hakt).
export async function learnText(
  text: string,
  category?: string,
): Promise<LearnResult> {
  return req<LearnResult>('/learn', {
    method: 'POST',
    body: JSON.stringify({ text, category: category || undefined }),
  });
}

export type LlmStatus = {
  configured: boolean;
  provider?: 'deepseek' | 'openai' | null;
  model?: string | null;
};

// Of er een LLM-key beschikbaar is, en welke provider. Geeft NOOIT de key zelf terug.
export async function getLlmStatus(): Promise<LlmStatus> {
  return req<LlmStatus>('/config/llm-status');
}

// Sla de LLM-key lokaal op (in de data-map, niet in de JS-bundle). Het brein
// herleest de key per call, dus de volgende /ask werkt direct — geen herstart.
export async function setLlmKey(
  key: string,
): Promise<{ ok: boolean; configured: boolean }> {
  return req<{ ok: boolean; configured: boolean }>('/config/llm-key', {
    method: 'POST',
    body: JSON.stringify({ key }),
  });
}

// Verwijder het lokale key-bestand. configured weerspiegelt de actuele situatie
// (een env-key blijft staan; die leeft niet in dit bestand).
export async function deleteLlmKey(): Promise<{ configured: boolean }> {
  return req<{ configured: boolean }>('/config/llm-key', {
    method: 'DELETE',
  });
}

// Semantic knowledge graph (nodes per item, edges from embedding similarity).
// Key-free: the brein builds it from the local ChromaDB embeddings.
export async function getGraph(neighbors?: number): Promise<KennisGraph> {
  const qs = neighbors != null ? `?neighbors=${neighbors}` : '';
  return req<KennisGraph>(`/graph${qs}`);
}

// Auto-opschonen: clusters van near-duplicate kennis-items, gevonden via de
// bestaande embeddings (key-free, geen LLM). Per cluster blijft één keeper staan
// en zijn de overige titels verwijderbaar.
export type CleanupCluster = { keep: string; remove: string[] };
export type CleanupPreview = {
  groepen: number;
  duplicaten: number;
  clusters: CleanupCluster[];
};
export type CleanupApplyResult = { verwijderd: number };

// Read-only voorbeeld: hoeveel duplicaten in hoeveel groepen, vóór verwijderen.
export async function cleanupPreview(threshold?: number): Promise<CleanupPreview> {
  const qs = threshold != null ? `?threshold=${threshold}` : '';
  return req<CleanupPreview>(`/cleanup/preview${qs}`);
}

// Muterend: verwijder per groep alles behalve de keeper. Geeft het aantal
// verwijderde items terug.
export async function cleanupApply(
  threshold?: number,
): Promise<CleanupApplyResult> {
  return req<CleanupApplyResult>('/cleanup/apply', {
    method: 'POST',
    body: JSON.stringify(threshold != null ? { threshold } : {}),
  });
}
