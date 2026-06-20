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
