import type { Request, Response } from 'express';
import { dbPool } from '../db/pool';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(['RECEIPT', 'SALE', 'CUSTOMER_RETURN', 'WRITE_OFF', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'COUNT_VARIANCE', 'COUNT', 'IN', 'OUT']);
const KEYS = new Set(['product_id', 'location_id', 'movement_type', 'user_id', 'reference_id', 'from', 'to', 'page', 'pageSize']);
class InputError extends Error {}
type Filter = { where: string; values: unknown[]; page: number; pageSize: number };
type RecordRow = Record<string, unknown>;

function optional(query: Request['query'], name: string): string | null {
  const value = query[name];
  if (value === undefined) return null;
  if (typeof value !== 'string' || !value.trim()) throw new InputError(`${name} must be one non-empty string.`);
  return value.trim();
}
function date(value: string | null, name: string): string | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  if ((!dateOnly && !iso) || !Number.isFinite(Date.parse(value))) throw new InputError(`${name} must be YYYY-MM-DD or an ISO timestamp with timezone.`);
  if (dateOnly && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new InputError(`${name} is not a calendar date.`);
  return value;
}
function integer(query: Request['query'], name: string, fallback: number, max: number): number {
  const value = query[name];
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw new InputError(`${name} must be between 1 and ${max}.`);
  return Number(value);
}
function parseFilters(req: Request): Filter {
  const unknown = Object.keys(req.query).filter(k => !KEYS.has(k));
  if (unknown.length) throw new InputError(`Unknown parameter(s): ${unknown.join(', ')}.`);
  const values: unknown[] = [];
  const conditions: string[] = [];
  const add = (v: unknown) => { values.push(v); return `$${values.length}`; };
  for (const name of ['product_id', 'location_id', 'user_id', 'reference_id']) {
    const value = optional(req.query, name);
    if (value) {
      if (!UUID.test(value)) throw new InputError(`${name} must be a UUID.`);
      conditions.push(`sm.${name} = ${add(value)}::uuid`);
    }
  }
  const types = optional(req.query, 'movement_type');
  if (types) {
    const selected = types.toUpperCase().split(',');
    if (selected.length > 20 || selected.some(t => !TYPES.has(t)) || new Set(selected).size !== selected.length) throw new InputError('Invalid or repeated movement_type. Use comma-separated movement types.');
    conditions.push(`UPPER(sm.movement_type) = ANY(${add(selected)}::text[])`);
  }
  const from = date(optional(req.query, 'from'), 'from');
  const to = date(optional(req.query, 'to'), 'to');
  const bound = (v: string, end: boolean) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T00:00:00Z`) + (end ? 86400000 - 1 : 0) : Date.parse(v);
  if (from && to && bound(from, false) > bound(to, true)) throw new InputError('from must be earlier than or equal to to.');
  if (from) conditions.push(/^\d{4}-\d{2}-\d{2}$/.test(from) ? `sm.created_at >= ${add(from)}::date` : `sm.created_at >= ${add(from)}::timestamptz`);
  if (to) conditions.push(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `sm.created_at < (${add(to)}::date + INTERVAL '1 day')` : `sm.created_at <= ${add(to)}::timestamptz`);
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values, page: integer(req.query, 'page', 1, 1_000_000), pageSize: integer(req.query, 'pageSize', 50, 100) };
}

const SELECT = `SELECT sm.movement_id, sm.movement_no, sm.movement_type, sm.reason_code_id, rc.label AS reason_code_label,
 sm.reference_no, sm.reverses_movement_id, sm.product_id, p.name AS product_name, p.sku,
 sm.location_id, l.name AS location_name, l.code AS location_code,
 paired.movement_id AS paired_movement_id, second_location.location_id AS second_location_id,
 second_location.name AS second_location_name, second_location.code AS second_location_code,
 sm.user_id, u.first_name, u.last_name, u.email,
 sm.quantity_change::text, sm.quantity_before::text, sm.quantity_after::text,
 sm.reference_id::text, sm.reason, sm.notes, sm.created_at
 FROM public.stock_movements sm
 JOIN public.products p ON p.product_id = sm.product_id
 JOIN public.locations l ON l.location_id = sm.location_id
 JOIN public.users u ON u.user_id = sm.user_id
 LEFT JOIN public.reason_codes rc ON rc.reason_code_id = sm.reason_code_id
 LEFT JOIN LATERAL (
   SELECT other.movement_id, other.location_id FROM public.stock_movements other
   WHERE sm.reference_id IS NOT NULL AND other.reference_id = sm.reference_id
     AND other.product_id = sm.product_id AND other.movement_id <> sm.movement_id
     AND ((sm.movement_type = 'TRANSFER_OUT' AND other.movement_type = 'TRANSFER_IN')
       OR (sm.movement_type = 'TRANSFER_IN' AND other.movement_type = 'TRANSFER_OUT'))
   ORDER BY other.created_at, other.movement_id LIMIT 1
 ) paired ON TRUE
 LEFT JOIN public.locations second_location ON second_location.location_id = paired.location_id`;
const ORDER = 'ORDER BY sm.created_at DESC, sm.movement_id DESC';
function shape(r: RecordRow) {
  return {
    movement_id: r.movement_id, movement_no: r.movement_no, movement_type: r.movement_type,
    reason_code_id: r.reason_code_id, reason_code: r.reason_code_label,
    reference_no: r.reference_no, reverses_movement_id: r.reverses_movement_id,
    product: { product_id: r.product_id, name: r.product_name, sku: r.sku },
    location: { location_id: r.location_id, name: r.location_name, code: r.location_code },
    second_location: r.second_location_id ? { location_id: r.second_location_id, name: r.second_location_name, code: r.second_location_code } : null,
    paired_movement_id: r.paired_movement_id,
    quantity_change: r.quantity_change, quantity_before: r.quantity_before, quantity_after: r.quantity_after,
    user: { user_id: r.user_id, name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email, email: r.email },
    created_at: r.created_at, reason: r.reason, notes: r.notes, reference_id: r.reference_id,
  };
}
function failure(res: Response, err: unknown, action: string) {
  if (err instanceof InputError) { res.status(400).json({ error: err.message }); return; }
  console.error(action, err);
  res.status(500).json({ error: 'Unable to retrieve stock movement history.' });
}
export async function getStockMovements(req: Request, res: Response): Promise<void> {
  try {
    const f = parseFilters(req);
    const count = await dbPool.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM public.stock_movements sm ${f.where}`, f.values);
    const offset = (f.page - 1) * f.pageSize;
    if (!Number.isSafeInteger(offset)) throw new InputError('Requested page is too large.');
    const rows = await dbPool.query<RecordRow>(`${SELECT} ${f.where} ${ORDER} LIMIT $${f.values.length + 1} OFFSET $${f.values.length + 2}`, [...f.values, f.pageSize, offset]);
    res.json({ items: rows.rows.map(shape), total: Number(count.rows[0]?.total ?? 0), page: f.page, pageSize: f.pageSize });
  } catch (e) { failure(res, e, 'List movements failed:'); }
}

export async function getStockMovementDetail(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id;

    console.log('[F02 DEBUG] Movement detail request:', {
      id,
      type: typeof id,
      params: req.params,
      originalUrl: req.originalUrl,
    });

    if (typeof id !== 'string' || !UUID.test(id)) {
      throw new InputError('Invalid movement ID.');
    }
    const movement = await dbPool.query<RecordRow>(
      `${SELECT} WHERE sm.movement_id = $1::uuid`,
      [id]
    );
    // Explicitly check that a movement exists.
    const source = movement.rows[0];
    if (!source) {
      res.status(404).json({ error: 'Movement not found.' });
      return;
    }
    // Fetch linked movements only when a reference_id exists.
    const linked = source.reference_id
      ? await dbPool.query<RecordRow>(
          `${SELECT} WHERE sm.reference_id = $1::uuid AND sm.movement_id <> $2::uuid ${ORDER} LIMIT 100`,
          [source.reference_id, id]
        )
      : { rows: [] as RecordRow[] };
    // Fetch reversal movements.
    const reversals = await dbPool.query<RecordRow>(
      `${SELECT} WHERE sm.reverses_movement_id = $1::uuid ${ORDER}`,
      [id]
    );
    // Combine linked movements and reversals, avoiding duplicates.
    const related = new Map<string, ReturnType<typeof shape>>();
    for (const r of [...linked.rows, ...reversals.rows]) {
      related.set(String(r.movement_id), shape(r));
    }
    res.json({
      movement: shape(source),
      linked: [...related.values()]
    });
  } catch (e) {
    failure(res, e, 'Movement detail failed:');
  }
}

function csvCell(value: unknown): string {
  const string = value === null || value === undefined ? '' : String(value);
  // Quote all strings, neutralise spreadsheet formula injection.
  const safe = /^[\s]*[=+@\-\t\r]/.test(string) ? `'${string}` : string;
  return `"${safe.replace(/"/g, '""')}"`;
}
function csvQuantity(value: unknown): string {
  const string = String(value ?? '');
  return /^-?\d+(?:\.\d+)?$/.test(string) ? string : csvCell(value);
}
export async function exportStockMovementsCsv(req: Request, res: Response): Promise<void> {
  try {
    const f = parseFilters(req);
    // Export intentionally ignores page/pageSize, and covers ALL filtered rows.
    const count = await dbPool.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM public.stock_movements sm ${f.where}`, f.values);
    if (Number(count.rows[0]?.total ?? 0) > 10000) { res.status(413).json({ error: 'Export exceeds 10,000 rows. Narrow the filters.' }); return; }
    const rows = await dbPool.query<RecordRow>(`${SELECT} ${f.where} ${ORDER}`, f.values);
    const headers = ['Movement no', 'Date/time UTC', 'Type', 'Product', 'SKU', 'Location', 'Other location', 'Change', 'Balance before', 'Balance after', 'User', 'Reason code', 'Reason', 'Reference', 'Notes'];
    const lines = [headers.map(csvCell).join(',')];
    for (const r of rows.rows) {
      const m = shape(r);
      lines.push([m.movement_no, new Date(m.created_at as string).toISOString(), m.movement_type, m.product.name, m.product.sku,
        m.location.name, m.second_location?.name ?? '', m.quantity_change, m.quantity_before, m.quantity_after,
        m.user.name, m.reason_code, m.reason, m.reference_no ?? m.reference_id, m.notes].map((value, index) => index >= 7 && index <= 9 ? csvQuantity(value) : csvCell(value)).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="stock-movements.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(`\uFEFF${lines.join('\r\n')}\r\n`);
  } catch (e) { failure(res, e, 'Movement export failed:'); }
}
export async function getMovementActors(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await dbPool.query<{ user_id: string; name: string }>(`SELECT DISTINCT u.user_id,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email) AS name
      FROM public.users u JOIN public.stock_movements sm ON sm.user_id = u.user_id ORDER BY name, u.user_id`);
    res.json({ items: rows.rows });
  } catch (e) { failure(res, e, 'Movement actors failed:'); }
}
