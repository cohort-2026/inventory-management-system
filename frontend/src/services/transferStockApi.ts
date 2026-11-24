
import { getLocations, getProducts } from './api';
import type { LocationOption, ProductOption } from './api';

const API_BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}/api`;

type JsonObject = Record<string, unknown>;

function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

export type TransferInventoryRow = {
  inventory_id: string | null;
  product_id: string;
  location_id: string;
  quantity: string;
};

export type TransferStockChange = {
  location_id: string;
  inventory_id: string;
  quantity_before: string;
  quantity_after: string;
};

export type TransferResult = {
  transfer_id: string;
  transfer_no: string;
  status: 'IN_TRANSIT';
  product_id: string;
  quantity_sent: string;
  from_location_id: string;
  to_location_id: string;
  transit_location_id: string;
  source: TransferStockChange;
  transit: TransferStockChange;
};

export type TransferLine = {
  transfer_line_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  unit_of_measure: string;
  quantity_sent: string;
  quantity_received: string | null;
  shortage_reason_code_id?: string | null;
  shortage_note?: string | null;
};

export type PendingTransfer = {
  transfer_id: string;
  transfer_no: string;
  status: string;
  note: string | null;
  created_at: string;
  dispatched_at: string | null;
  from_location_id: string;
  from_location_name: string;
  to_location_id: string;
  to_location_name: string;
  lines: TransferLine[];
};

export type TransferDetails = PendingTransfer & {
  received_at?: string | null;
  received_by?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
};

export type ReceiveTransferResult = {
  transfer_id: string;
  transfer_no: string;
  status: 'RECEIVED';
  received_by?: string;
  lines: Array<{
    transfer_line_id: string;
    product_id: string;
    quantity_sent: string;
    quantity_received: string;
    shortage_quantity: string;
    transit_quantity_after: string;
    destination_quantity_after: string;
  }>;
};

export type CancelTransferResult = {
  transfer_id: string;
  transfer_no: string;
  status: 'CANCELLED';
};

export class TransferApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'TransferApiError';
  }
}

async function fetchJson(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      object(payload) && typeof payload.error === 'string'
        ? payload.error
        : response.status === 403
          ? 'You do not have permission to perform this transfer action.'
          : response.status === 401
            ? 'Your session has expired. Please sign in again.'
            : `Request failed (HTTP ${response.status}).`;

    throw new TransferApiError(response.status, message);
  }

  return payload;
}

export async function fetchTransferOptions(): Promise<{
  products: ProductOption[];
  locations: LocationOption[];
}> {
  const [products, locations] = await Promise.all([
    getProducts(),
    getLocations(),
  ]);

  return { products, locations };
}

// GET /api/inventory is paginated. Load every page so unlisted
// product-location combinations are not silently mistaken for zero stock.
export async function fetchAllTransferInventory(): Promise<TransferInventoryRow[]> {
  const all: TransferInventoryRow[] = [];
  const pageSize = 100;
  let page = 1;

  while (true) {
    const payload = await fetchJson(
      `/inventory?page=${page}&pageSize=${pageSize}`,
    );

    if (
      !object(payload) ||
      !Array.isArray(payload.items) ||
      typeof payload.total !== 'number' ||
      !Number.isSafeInteger(payload.total) ||
      payload.total < 0
    ) {
      throw new Error(
        'The inventory API returned an invalid paginated response.',
      );
    }

    for (const row of payload.items as unknown[]) {
      if (
        !object(row) ||
        (row.inventory_id !== null && typeof row.inventory_id !== 'string') ||
        typeof row.product_id !== 'string' ||
        typeof row.location_id !== 'string' ||
        (typeof row.quantity !== 'string' &&
          typeof row.quantity !== 'number')
      ) {
        throw new Error(
          'The inventory API returned an invalid stock record.',
        );
      }

      const quantity = String(row.quantity);

      if (!/^(?:\d+)(?:\.\d+)?$/.test(quantity)) {
        throw new Error(
          'The inventory API returned an invalid stock quantity.',
        );
      }

      all.push({
        inventory_id: row.inventory_id as string | null,
        product_id: row.product_id,
        location_id: row.location_id,
        quantity,
      });
    }

    if (all.length >= payload.total) {
      return all;
    }

    if (payload.items.length === 0) {
      throw new Error(
        'Inventory pagination ended before all records were loaded.',
      );
    }

    page += 1;

    if (page > 1000) {
      throw new Error(
        'Too many inventory pages; a filtered inventory endpoint is required.',
      );
    }
  }
}

// F09: Dispatch stock from the source location into Stock in Transit.
// POST /api/inventory/transfers/dispatch
export async function submitStockTransfer(input: {
  product_id: string;
  from_location_id: string;
  to_location_id: string;
  quantity: string;
  note: string | null;
}): Promise<TransferResult> {
  const payload = await fetchJson('/inventory/transfers/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (
    !object(payload) ||
    typeof payload.transfer_id !== 'string' ||
    typeof payload.transfer_no !== 'string' ||
    payload.status !== 'IN_TRANSIT' ||
    typeof payload.product_id !== 'string' ||
    typeof payload.from_location_id !== 'string' ||
    typeof payload.to_location_id !== 'string' ||
    typeof payload.transit_location_id !== 'string' ||
    !object(payload.source) ||
    !object(payload.transit)
  ) {
    throw new Error(
      'Dispatch may have completed, but the server returned an unexpected response. Refresh transfers before retrying.',
    );
  }

  const source = payload.source;
  const transit = payload.transit;

  for (const row of [source, transit]) {
    if (
      typeof row.location_id !== 'string' ||
      typeof row.inventory_id !== 'string' ||
      row.quantity_before === undefined ||
      row.quantity_after === undefined
    ) {
      throw new Error(
        'Dispatch may have completed, but the server returned unexpected stock quantities. Refresh inventory before retrying.',
      );
    }
  }

  if (
    source.location_id !== payload.from_location_id ||
    transit.location_id !== payload.transit_location_id
  ) {
    throw new Error(
      'The server returned inconsistent transfer location details.',
    );
  }

  return {
    transfer_id: payload.transfer_id,
    transfer_no: payload.transfer_no,
    status: 'IN_TRANSIT',
    product_id: payload.product_id,
    quantity_sent: asString(payload.quantity_sent),
    from_location_id: payload.from_location_id,
    to_location_id: payload.to_location_id,
    transit_location_id: payload.transit_location_id,
    source: {
      location_id: source.location_id as string,
      inventory_id: source.inventory_id as string,
      quantity_before: asString(source.quantity_before),
      quantity_after: asString(source.quantity_after),
    },
    transit: {
      location_id: transit.location_id as string,
      inventory_id: transit.inventory_id as string,
      quantity_before: asString(transit.quantity_before),
      quantity_after: asString(transit.quantity_after),
    },
  };
}

// F09: List transfers waiting to be received.
// GET /api/inventory/transfers/pending
export async function fetchPendingTransfers(): Promise<PendingTransfer[]> {
  const payload = await fetchJson('/inventory/transfers/pending');

  if (!object(payload) || !Array.isArray(payload.transfers)) {
    throw new Error('The pending transfers API returned an invalid response.');
  }

  return payload.transfers as PendingTransfer[];
}

// F09: Get one transfer and its line details.
// GET /api/inventory/transfers/:transferId
export async function fetchTransferDetails(
  transferId: string,
): Promise<TransferDetails> {
  const payload = await fetchJson(
    `/inventory/transfers/${encodeURIComponent(transferId)}`,
  );

  if (!object(payload) || !object(payload.transfer)) {
    throw new Error('The transfer details API returned an invalid response.');
  }

  return payload.transfer as unknown as TransferDetails;
}

// F09: Record the quantities actually received.
// POST /api/inventory/transfers/:transferId/receive
export async function receiveStockTransfer(
  transferId: string,
  input: {
    lines: Array<{
      transfer_line_id: string;
      quantity_received: string;
      shortage_reason_code_id?: string | null;
      shortage_note?: string | null;
    }>;
  },
): Promise<ReceiveTransferResult> {
  const payload = await fetchJson(
    `/inventory/transfers/${encodeURIComponent(transferId)}/receive`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );

  if (
    !object(payload) ||
    typeof payload.transfer_id !== 'string' ||
    typeof payload.transfer_no !== 'string' ||
    payload.status !== 'RECEIVED' ||
    !Array.isArray(payload.lines)
  ) {
    throw new Error(
      'Receipt may have completed, but the server returned an unexpected response. Refresh the transfer before retrying.',
    );
  }

  return payload as unknown as ReceiveTransferResult;
}

// F09: Cancel an in-transit transfer and return stock to its source.
// POST /api/inventory/transfers/:transferId/cancel
export async function cancelStockTransfer(
  transferId: string,
): Promise<CancelTransferResult> {
  const payload = await fetchJson(
    `/inventory/transfers/${encodeURIComponent(transferId)}/cancel`,
    {
      method: 'POST',
    },
  );

  if (
    !object(payload) ||
    typeof payload.transfer_id !== 'string' ||
    typeof payload.transfer_no !== 'string' ||
    payload.status !== 'CANCELLED'
  ) {
    throw new Error(
      'Cancellation may have completed, but the server returned an unexpected response. Refresh the transfer before retrying.',
    );
  }

  return payload as unknown as CancelTransferResult;
}
