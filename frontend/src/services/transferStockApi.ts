import { getLocations, getProducts } from './api';
import type { LocationOption, ProductOption } from './api';

const API_BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}/api`;

type JsonObject = Record<string, unknown>;
function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type TransferInventoryRow = {
  inventory_id: string;
  product_id: string;
  location_id: string;
  quantity: string;
};

export type TransferResult = {
  reference_id: string;
  product_id: string;
  quantity_transferred: string;
  source: { location_id: string; inventory_id: string; quantity_before: string; quantity_after: string };
  destination: { location_id: string; inventory_id: string; quantity_before: string; quantity_after: string };
};

export class TransferApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'TransferApiError';
  }
}

async function fetchJson(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...options.headers },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = object(payload) && typeof payload.error === 'string'
      ? payload.error
      : response.status === 403 ? 'You do not have permission to transfer stock.'
        : response.status === 401 ? 'Your session has expired. Please sign in again.'
        : `Request failed (HTTP ${response.status}).`;
    throw new TransferApiError(response.status, message);
  }
  return payload;
}

export async function fetchTransferOptions(): Promise<{ products: ProductOption[]; locations: LocationOption[] }> {
  const [products, locations] = await Promise.all([getProducts(), getLocations()]);
  return { products, locations };
}

// GET /api/inventory is paginated. Load every page so unlisted product-location
// combinations are not silently mistaken for having zero stock.
export async function fetchAllTransferInventory(): Promise<TransferInventoryRow[]> {
  const all: TransferInventoryRow[] = [];
  const pageSize = 100;
  let page = 1;
  while (true) {
    const payload = await fetchJson(`/inventory?page=${page}&pageSize=${pageSize}`);
    if (!object(payload) || !Array.isArray(payload.items) ||
        typeof payload.total !== 'number' || !Number.isSafeInteger(payload.total) || payload.total < 0) {
      throw new Error('The inventory API returned an invalid paginated response.');
    }
    for (const row of payload.items as unknown[]) {
      if (!object(row) || typeof row.inventory_id !== 'string' ||
          typeof row.product_id !== 'string' || typeof row.location_id !== 'string' ||
          (typeof row.quantity !== 'string' && typeof row.quantity !== 'number')) {
        throw new Error('The inventory API returned an invalid stock record.');
      }
      const quantity = String(row.quantity);
      if (!/^(?:\d+)(?:\.\d+)?$/.test(quantity)) {
        throw new Error('The inventory API returned an invalid stock quantity.');
      }
      all.push({ inventory_id: row.inventory_id, product_id: row.product_id, location_id: row.location_id, quantity });
    }
    if (all.length >= payload.total) return all;
    if (payload.items.length === 0) throw new Error('Inventory pagination ended before all records were loaded.');
    page += 1;
    if (page > 1000) throw new Error('Too many inventory pages; a filtered inventory endpoint is required.');
  }
}

export async function submitStockTransfer(input: {
  product_id: string;
  from_location_id: string;
  to_location_id: string;
  quantity: string;
  note: string | null;
}): Promise<TransferResult> {
  const payload = await fetchJson('/inventory/transfers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!object(payload) || typeof payload.reference_id !== 'string' ||
      typeof payload.product_id !== 'string' ||
      (typeof payload.quantity_transferred !== 'string' && typeof payload.quantity_transferred !== 'number') ||
      !object(payload.source) || !object(payload.destination)) {
    throw new Error('Transfer completed but the server returned an unexpected response. Refresh inventory before retrying.');
  }
  const s = payload.source;
  const d = payload.destination;
  for (const row of [s, d]) {
    if (typeof row.location_id !== 'string' || typeof row.inventory_id !== 'string' ||
        (typeof row.quantity_before !== 'string' && typeof row.quantity_before !== 'number') ||
        (typeof row.quantity_after !== 'string' && typeof row.quantity_after !== 'number')) {
      throw new Error('Transfer completed but the server returned unexpected quantities. Refresh inventory before retrying.');
    }
  }
  return {
    reference_id: payload.reference_id,
    product_id: payload.product_id,
    quantity_transferred: String(payload.quantity_transferred),
    source: { location_id: s.location_id as string, inventory_id: s.inventory_id as string, quantity_before: String(s.quantity_before), quantity_after: String(s.quantity_after) },
    destination: { location_id: d.location_id as string, inventory_id: d.inventory_id as string, quantity_before: String(d.quantity_before), quantity_after: String(d.quantity_after) },
  };
}
