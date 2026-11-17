
const ROOT = `${
  (import.meta.env.VITE_API_URL ?? 'http://localhost:5000').replace(/\/$/, '')
}/api`;

export type Supplier = {
  supplier_id: string;
  supplier_code: string;
  name: string;
  status: 'active' | 'inactive';
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type Receipt = {
  receipt_id: string;
  receipt_no: string;
  status: 'draft' | 'posted';
  supplier_id: string;
  location_id: string;
  delivery_note: string;
  notes: string | null;
  supplier_name?: string;
  location_name?: string;
  created_at: string;
  posted_at: string | null;
};

export type ReceiptLine = {
  line_id: string;
  line_number: number;
  product_id: string;
  product_name: string;
  sku: string;
  expected_packs: string;
  received_packs: string;
  units_per_pack: string;
  unit_cost: string | null;
  short_delivery_note: string | null;
  base_units: string;
  movement_id: string | null;
  movement_no: string | null;
};

export type Product = {
  product_id: string;
  name: string;
  sku: string;
  status?: string;
};

export type Location = {
  location_id: string;
  name: string;
  code: string;
  status: string;
};

export type EditableLine = {
  product_id: string;
  expected_packs: string;
  received_packs: string;
  units_per_pack: string;
  unit_cost: string;
  short_delivery_note: string;
};

async function json<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const r = await fetch(`${ROOT}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...init.headers
    }
  });

  const payload: unknown = await r.json().catch(() => ({}));

  if (!r.ok) {
    const err =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : `HTTP ${r.status}`;

    throw new Error(err);
  }

  return payload as T;
}

const body = (value: unknown) => ({
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(value)
});

export const listSuppliers = async () =>
  (await json<{ items: Supplier[] }>('/suppliers')).items;

export const createSupplier = (
  value: {
    supplier_code: string;
    name: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    address?: string;
  }
) =>
  json<{ supplier: Supplier }>('/suppliers', {
    method: 'POST',
    ...body(value)
  });

export const updateSupplier = (
  id: string,
  value: Partial<
    Pick<
      Supplier,
      'name' |
      'contact_name' |
      'email' |
      'phone' |
      'address' |
      'status'
    >
  >
) =>
  json<{ supplier: Supplier }>(
    `/suppliers/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      ...body(value)
    }
  );

export const listReceipts = (
  status?: 'draft' | 'posted'
) =>
  json<{ items: Receipt[]; total: number }>(
    '/receipts' + (status ? `?status=${status}` : '')
  );

export const getReceipt = (id: string) =>
  json<{ receipt: Receipt; lines: ReceiptLine[] }>(
    `/receipts/${encodeURIComponent(id)}`
  );

export const createReceipt = (
  v: {
    supplier_id: string;
    location_id: string;
    delivery_note: string;
    notes?: string;
  }
) =>
  json<{ receipt: Receipt }>('/receipts', {
    method: 'POST',
    ...body(v)
  });

export const saveLines = (
  id: string,
  lines: EditableLine[]
) =>
  json<{ receipt: Receipt; lines: ReceiptLine[] }>(
    `/receipts/${encodeURIComponent(id)}/lines`,
    {
      method: 'PUT',
      ...body({
        lines: lines.map(l => ({
          ...l,
          unit_cost: l.unit_cost.trim() === '' ? null : l.unit_cost,
          short_delivery_note:
            l.short_delivery_note.trim() === ''
              ? null
              : l.short_delivery_note
        }))
      })
    }
  );

export const postReceipt = (id: string) =>
  json<{
    receipt_id: string;
    receipt_no: string;
    status: string;
    movements: {
      movement_id: string;
      movement_no: string;
    }[];
  }>(
    `/receipts/${encodeURIComponent(id)}/post`,
    {
      method: 'POST',
      ...body({})
    }
  );

export const listLocations = async () =>
  (await json<{ items: Location[] }>('/locations')).items;

export async function listProducts(): Promise<Product[]> {
  let page = 1;
  const items: Product[] = [];

  for (; page <= 100; page++) {
    const p = await json<{
      items: Product[];
      total: number;
    }>(
      `/products?status=active&page=${page}&pageSize=100`
    );

    items.push(...p.items);

    if (p.items.length < 100) break;
  }

  return items;
}
