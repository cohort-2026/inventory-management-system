/** Stock Count API adapter. API calls use the same-origin Vercel proxy in production. */
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const BASE = `${API_ORIGIN}/api/inventory/counts`;
const LOCATIONS_URL = `${API_ORIGIN}/api/locations`;

export type CountStatus = 'open' | 'completed' | string;
export interface StockCount {
  count_id: string;
  location_id: string;
  user_id: string;
  status: CountStatus;
  note: string | null;
  created_at: string;
  completed_at?: string | null;
  completed_by?: string | null;
}
export interface CountLine {
  product_id: string;
  product_name: string | null;
  expected_quantity: string;
  counted_quantity: string | null;
}
export interface LocationOption {
  location_id: string;
  name: string;
  code: string;
  status: string;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function message(value: unknown, fallback: string): string {
  if (object(value) && typeof value.error === 'string') return value.error;
  return fallback;
}
async function api(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    credentials: 'include', cache: 'no-store', ...init,
    headers: { Accept: 'application/json', ...init.headers },
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON from ${new URL(url, window.location.origin).pathname}; check the Vercel API proxy.`);
  }
  const data: unknown = await response.json();
  if (!response.ok) {
    if (response.status === 403) throw new Error('You do not have permission to perform this action.');
    throw new Error(message(data, `Request failed (HTTP ${response.status}).`));
  }
  return data;
}
function parseCount(data: unknown): StockCount {
  if (!object(data) || typeof data.count_id !== 'string' ||
    typeof data.location_id !== 'string' || typeof data.status !== 'string' ||
    typeof data.user_id !== 'string' || typeof data.created_at !== 'string') {
    throw new Error('The server returned an unexpected count record.');
  }
  return data as unknown as StockCount;
}
export async function listCounts(): Promise<StockCount[]> {
  const data = await api(BASE);
  if (!Array.isArray(data)) throw new Error('The count list response must be an array.');
  return data.map(parseCount);
}
export async function listCountLocations(): Promise<LocationOption[]> {
  const data = await api(LOCATIONS_URL);
  if (!object(data) || !Array.isArray(data.items)) throw new Error('Invalid locations response.');
  if (!data.items.every((x: unknown) => object(x) && typeof x.location_id === 'string' && typeof x.name === 'string' && typeof x.code === 'string' && typeof x.status === 'string')) {
    throw new Error('Invalid location record.');
  }
  return data.items as LocationOption[];
}
export async function startCount(locationId: string): Promise<StockCount> {
  return parseCount(await api(BASE, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({location_id: locationId})}));
}
export interface StockCountDetail {
  count: StockCount;
  items: CountLine[];
}

export async function getCountDetail(id: string): Promise<StockCountDetail> {
  const data = await api(`${BASE}/${encodeURIComponent(id)}`);
  if (!object(data) || !object(data.count) || !Array.isArray(data.items) ||
    !data.items.every((x: unknown) => object(x) && typeof x.product_id === 'string' &&
      (typeof x.product_name === 'string' || x.product_name === null) &&
      (typeof x.expected_quantity === 'number' || typeof x.expected_quantity === 'string') &&
      (x.counted_quantity === null || x.counted_quantity === undefined ||
       typeof x.counted_quantity === 'number' || typeof x.counted_quantity === 'string'))) {
    throw new Error('The server returned an unexpected count detail response.');
  }
  return {
    count: parseCount(data.count),
    items: data.items.map((x: CountLine) => ({
      product_id: x.product_id,
      product_name: x.product_name,
      expected_quantity: String(x.expected_quantity),
      counted_quantity: x.counted_quantity == null ? null : String(x.counted_quantity),
    })),
  };
}

export async function saveCount(id: string, lines: {product_id: string; counted_quantity: string}[]): Promise<void> {
  if (lines.length === 0) throw new Error('Enter at least one counted quantity before saving.');
  await api(`${BASE}/${encodeURIComponent(id)}/items`, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({items: lines}),
  });
}
export async function finalizeCount(id: string): Promise<void> {
  await api(`${BASE}/${encodeURIComponent(id)}/finalize`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
}
