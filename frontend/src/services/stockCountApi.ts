/** F08-B stock counts. Uses authenticated cookie sessions and role-filtered API. */
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const BASE = `${API_ORIGIN}/api/counts`;
const LOCATIONS_URL = `${API_ORIGIN}/api/locations`;

export type CountStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'POSTED'
  | 'CANCELLED'
  | 'open'
  | 'completed';

export interface StockCount {
  count_id: string;
  count_no: string;
  location_id: string;
  user_id: string | null;
  status: CountStatus;
  note: string | null;
  created_at: string;
  submitted_at: string | null;
  submitted_by: string | null;
  recount_round: number;
  legacy_completed: boolean;
  completed_at?: string | null;
}

export interface CountLine {
  product_id: string;
  product_name: string | null;
  sku: string;
  counted_quantity: string | null;
  recount_required: boolean;
}

export interface LocationOption {
  location_id: string;
  name: string;
  code: string;
  status: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function request(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = isObject(data) && typeof data.error === 'string'
      ? data.error
      : `Request failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return data;
}

function parseCount(data: unknown): StockCount {
  if (!isObject(data) || typeof data.count_id !== 'string' ||
      typeof data.count_no !== 'string' || typeof data.location_id !== 'string' ||
      typeof data.status !== 'string' || typeof data.created_at !== 'string') {
    throw new Error('Invalid count record returned by API.');
  }
  return data as unknown as StockCount;
}

export async function listCounts(): Promise<StockCount[]> {
  const data = await request(BASE);
  if (!Array.isArray(data)) throw new Error('Invalid count list response.');
  return data.map(parseCount);
}

export async function listCountLocations(): Promise<LocationOption[]> {
  const data = await request(LOCATIONS_URL);
  if (!isObject(data) || !Array.isArray(data.items)) {
    throw new Error('Invalid locations response.');
  }
  return data.items as LocationOption[];
}

export async function startCount(locationId: string): Promise<StockCount> {
  const data = await request(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location_id: locationId }),
  });
  return parseCount(data);
}

export async function getCountDetail(id: string): Promise<{ count: StockCount; items: CountLine[] }> {
  const data = await request(`${BASE}/${encodeURIComponent(id)}`);
  if (!isObject(data) || !Array.isArray(data.items)) {
    throw new Error('Invalid count detail response.');
  }
  // Defence in depth: reject any response that accidentally leaks snapshot data.
  if (data.items.some((line: unknown) => !isObject(line) || 'expected_quantity' in line || 'variance' in line)) {
    throw new Error('Unsafe count detail API response.');
  }
  return { count: parseCount(data.count), items: data.items as CountLine[] };
}

export async function saveCount(
  id: string,
  items: Array<{ product_id: string; counted_quantity: string }>,
): Promise<void> {
  if (!items.length) throw new Error('Enter at least one quantity before saving.');
  await request(`${BASE}/${encodeURIComponent(id)}/items`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

export async function submitCount(id: string): Promise<void> {
  await request(`${BASE}/${encodeURIComponent(id)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}


export interface CountReviewLine {
  product_id: string;
  product_name: string;
  sku: string;
  expected_quantity: string;
  counted_quantity: string | null;
  variance: string | null;
  has_variance: boolean;
  is_significant: boolean;
  reason_code_id: string | null;
  reason_note: string | null;
  recount_required: boolean;
  counted_by: string | null;
  current_quantity: string;
  snapshot_conflict: boolean;
}

export interface CountReview {
  count: StockCount;
  items: CountReviewLine[];
}

export interface CountReason {
  reason_code_id: string;
  code: string;
  label: string;
  requires_note: boolean;
}

export async function getCountReview(id: string): Promise<CountReview> {
  const data = await request(`${BASE}/${encodeURIComponent(id)}/review`);
  if (!isObject(data) || !Array.isArray(data.items)) {
    throw new Error('Invalid Manager review response.');
  }
  return { count: parseCount(data.count), items: data.items as CountReviewLine[] };
}

export async function listVarianceReasons(): Promise<CountReason[]> {
  const data = await request(`${BASE}/review-reasons`);
  if (!isObject(data) || !Array.isArray(data.items)) {
    throw new Error('Invalid variance reason response.');
  }
  return (data.items as CountReason[]).filter(reason =>
    typeof reason.reason_code_id === 'string' &&
    typeof reason.label === 'string' &&
    reason.code !== 'STOCK_COUNT_VARIANCE',
  );
}

export async function saveVarianceReasons(
  id: string,
  items: Array<{ product_id: string; reason_code_id: string; reason_note: string | null }>,
): Promise<void> {
  if (!items.length) throw new Error('Select at least one variance reason.');
  await request(`${BASE}/${encodeURIComponent(id)}/reasons`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

export async function requestCountRecount(
  id: string,
  productIds: string[],
  note: string,
): Promise<void> {
  await request(`${BASE}/${encodeURIComponent(id)}/recount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_ids: productIds, note }),
  });
}

export async function postApprovedCount(id: string): Promise<{
  count_id: string;
  count_no: string;
  status: 'POSTED';
  movements: Array<{ movement_id: string; movement_no: string }>;
}> {
  const data = await request(`${BASE}/${encodeURIComponent(id)}/post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  return data as {
    count_id: string;
    count_no: string;
    status: 'POSTED';
    movements: Array<{ movement_id: string; movement_no: string }>;
  };
}


export async function cancelActiveCount(id: string, note: string): Promise<void> {
  await request(`${BASE}/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
}
