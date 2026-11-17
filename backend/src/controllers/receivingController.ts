import type { Response } from 'express';
import type { PoolClient } from 'pg';
import type { SessionAuthenticatedRequest } from '../middleware/requireSession';
import { dbPool } from '../db/pool';
import { withTransaction } from '../db/withTransaction';
import { postMovement } from '../services/stockMovementService';
import { StockRuleError } from '../services/stockRules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

function fail(res: Response, e: unknown): void {
  if (e instanceof ApiError || e instanceof StockRuleError) {
    res.status(e.statusCode).json({ error: e.message });
    return;
  }
  const pg = e as { code?: string; constraint?: string };
  if (pg?.code === '23505') {
    res.status(409).json({ error: 'A supplier code, delivery note, or receipt line already exists.' });
    return;
  }
  if (pg?.code === '23503') {
    res.status(400).json({ error: 'A referenced record does not exist.' });
    return;
  }
  if (pg?.code === '23514' || pg?.code === '22P02' || pg?.code === '22003') {
    res.status(400).json({ error: 'One or more values violate validation rules.' });
    return;
  }
  console.error('F06 receiving request failed:', e);
  res.status(500).json({ error: 'Unable to complete receiving request.' });
}

function obj(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new ApiError(400, 'JSON object required.');
  return x as Record<string, unknown>;
}

function fields(o: Record<string, unknown>, allowed: string[]) {
  const extra = Object.keys(o).filter(k => !allowed.includes(k));
  if (extra.length) throw new ApiError(400, `Unexpected fields: ${extra.join(', ')}.`);
}

function str(x: unknown, name: string, max: number, required = true): string | null {
  if (x == null && !required) return null;
  if (typeof x !== 'string' || (required && !x.trim()) || x.trim().length > max) throw new ApiError(400, `${name} must be a ${required ? 'non-empty ' : ''}string (max ${max} characters).`);
  return x.trim() || null;
}

function id(x: unknown, name: string): string {
  if (typeof x !== 'string' || !UUID.test(x)) throw new ApiError(400, `${name} must be a UUID.`);
  return x;
}

function qty(x: unknown, name: string, positive = false): string {
  const v = String(x);
  if ((typeof x !== 'string' && typeof x !== 'number') || !/^\d+(?:\.\d{1,4})?$/.test(v) || v.length > 24 || (positive && Number(v) <= 0)) throw new ApiError(400, `${name} must be ${positive ? 'positive' : 'nonnegative'} with up to four decimals.`);
  return v;
}

function who(req: SessionAuthenticatedRequest): string {
  const v = req.authenticatedUser?.id;
  if (!v) throw new ApiError(401, 'Authentication required.');
  return id(v, 'user_id');
}

function receiptId(req: SessionAuthenticatedRequest): string {
  return id(req.params.id, 'receipt ID');
}

async function active(client: PoolClient, table: 'suppliers' | 'locations', key: string, value: string) {
  const r = await client.query(`SELECT status FROM public.${table} WHERE ${key}=$1 FOR SHARE`, [value]);
  if (!r.rowCount) throw new ApiError(404, `${table} record not found.`);
  if (r.rows[0].status !== 'active') throw new ApiError(400, `${table} record is inactive.`);
}

async function detail(client: PoolClient, receiptIdValue: string) {
  const r = await client.query(`SELECT r.*,s.name AS supplier_name,l.name AS location_name,u.first_name,u.last_name FROM public.goods_receipts r JOIN public.suppliers s USING(supplier_id) JOIN public.locations l USING(location_id) JOIN public.users u ON u.user_id=r.created_by WHERE receipt_id=$1`, [receiptIdValue]);
  if (!r.rowCount) throw new ApiError(404, 'GRN not found.');
  const lines = await client.query(`SELECT gl.*,p.name AS product_name,p.sku,p.unit_of_measure,(gl.received_packs*gl.units_per_pack)::text AS base_units,sm.movement_id,sm.movement_no FROM public.goods_receipt_lines gl JOIN public.products p USING(product_id) LEFT JOIN public.stock_movements sm ON sm.reference_id=gl.receipt_id AND sm.product_id=gl.product_id AND sm.movement_type='RECEIPT' WHERE gl.receipt_id=$1 ORDER BY gl.line_number`, [receiptIdValue]);
  return { receipt: r.rows[0], lines: lines.rows };
}

export async function listSuppliers(_req: SessionAuthenticatedRequest, res: Response) {
  try {
    const r = await dbPool.query('SELECT * FROM public.suppliers ORDER BY name,supplier_id LIMIT 500');
    res.json({ items: r.rows });
  } catch (e) {
    fail(res, e);
  }
}

export async function createSupplier(req: SessionAuthenticatedRequest, res: Response) {
  try {
    const o = obj(req.body);
    fields(o, ['supplier_code', 'name', 'contact_name', 'email', 'phone', 'address']);
    const code = str(o.supplier_code, 'supplier_code', 40)!;
    if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new ApiError(400, 'Supplier code may only contain letters, numbers, - and _.');
    const name = str(o.name, 'name', 200)!;
    const values = [code, name, str(o.contact_name, 'contact_name', 160, false), str(o.email, 'email', 254, false), str(o.phone, 'phone', 60, false), str(o.address, 'address', 2000, false)];
    const r = await dbPool.query('INSERT INTO public.suppliers(supplier_code,name,contact_name,email,phone,address) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', values);
    res.status(201).json({ supplier: r.rows[0] });
  } catch (e) {
    fail(res, e);
  }
}

export async function patchSupplier(req: SessionAuthenticatedRequest, res: Response) {
  try {
    const supplierId = id(req.params.id, 'supplier ID');
    const o = obj(req.body);
    fields(o, ['name', 'contact_name', 'email', 'phone', 'address', 'status']);
    if (!Object.keys(o).length) throw new ApiError(400, 'No fields supplied.');
    const values: unknown[] = [];
    const sets: string[] = [];
    for (const key of Object.keys(o)) {
      let v: unknown;
      if (key === 'status') {
        if (o.status !== 'active' && o.status !== 'inactive') throw new ApiError(400, 'Invalid status.');
        v = o.status;
      } else v = str(o[key], key, key === 'name' ? 200 : key === 'email' ? 254 : key === 'address' ? 2000 : 160, key === 'name');
      values.push(v);
      sets.push(`${key}=$${values.length}`);
    }
    values.push(supplierId);
    const r = await dbPool.query(`UPDATE public.suppliers SET ${sets.join(', ')},updated_at=now() WHERE supplier_id=$${values.length} RETURNING *`, values);
    if (!r.rowCount) throw new ApiError(404, 'Supplier not found.');
    res.json({ supplier: r.rows[0] });
  } catch (e) {
    fail(res, e);
  }
}

export async function listReceipts(req: SessionAuthenticatedRequest, res: Response) {
  try {
    const q = req.query.status;
    if (q !== undefined && q !== 'draft' && q !== 'posted') throw new ApiError(400, 'Invalid status.');
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new ApiError(400, 'Invalid page.');
    const result = await dbPool.query(`SELECT r.receipt_id,r.receipt_no,r.status,r.delivery_note,r.created_at,r.posted_at,s.name AS supplier_name,l.name AS location_name,COUNT(*) OVER()::integer AS total FROM public.goods_receipts r JOIN public.suppliers s USING(supplier_id) JOIN public.locations l USING(location_id) WHERE ($1::varchar IS NULL OR r.status=$1) ORDER BY r.created_at DESC,r.receipt_id DESC LIMIT 50 OFFSET $2`, [q ?? null, (page - 1) * 50]);
    res.json({ items: result.rows, total: result.rows[0]?.total ?? 0, page, pageSize: 50 });
  } catch (e) {
    fail(res, e);
  }
}

export async function getReceipt(req: SessionAuthenticatedRequest, res: Response) {
  try {
    const result = await detail(dbPool as unknown as PoolClient, receiptId(req));
    res.json(result);
  } catch (e) {
    fail(res, e);
  }
}

export async function createReceipt(req: SessionAuthenticatedRequest, res: Response) {
  try {
    const o = obj(req.body);
    fields(o, ['supplier_id', 'location_id', 'delivery_note', 'notes']);
    const supplier = id(o.supplier_id, 'supplier_id'), location = id(o.location_id, 'location_id'), note = str(o.delivery_note, 'delivery_note', 120)!, notes = str(o.notes, 'notes', 2000, false), user = who(req);
    const result = await withTransaction(async c => {
      await active(c, 'suppliers', 'supplier_id', supplier);
      await active(c, 'locations', 'location_id', location);
      const r = await c.query(`INSERT INTO public.goods_receipts(receipt_no,supplier_id,location_id,delivery_note,notes,created_by) VALUES ('GRN-'||lpad(nextval('public.f06_receipt_no_seq')::text,6,'0'),$1,$2,$3,$4,$5) RETURNING *`, [supplier, location, note, notes, user]);
      return r.rows[0];
    });
    res.status(201).json({ receipt: result });
  } catch (e) {
    fail(res, e);
  }
}

export async function replaceReceiptLines(
  req: SessionAuthenticatedRequest,
  res: Response
) {
  try {
    const rid = receiptId(req);
    const o = obj(req.body);
    fields(o, ['lines']);
    if (
      !Array.isArray(o.lines) ||
      !o.lines.length ||
      o.lines.length > 100
    ) {
      throw new ApiError(400, 'Provide 1 to 100 lines.');
    }
    const lines = o.lines.map((raw, i) => {
      const l = obj(raw);
      fields(l, [
        'product_id',
        'expected_packs',
        'received_packs',
        'units_per_pack',
        'unit_cost',
        'short_delivery_note'
      ]);
      return {
        product_id: id(l.product_id, `lines[${i}].product_id`),
        expected_packs: qty(l.expected_packs, 'expected_packs'),
        received_packs: qty(l.received_packs, 'received_packs'),
        units_per_pack: qty(l.units_per_pack, 'units_per_pack', true),
        unit_cost:
          l.unit_cost == null ? null : qty(l.unit_cost, 'unit_cost'),
        short_delivery_note: str(
          l.short_delivery_note,
          'short_delivery_note',
          2000,
          false
        )
      };
    });
    if (new Set(lines.map(l => l.product_id)).size !== lines.length) {
      throw new ApiError(400, 'Each product may occur only once per GRN.');
    }
    const result = await withTransaction(async c => {
      const r = await c.query(
        'SELECT status FROM public.goods_receipts WHERE receipt_id=$1 FOR UPDATE',
        [rid]
      );
      if (!r.rowCount || !r.rows[0]) {
        throw new ApiError(404, 'GRN not found.');
      }
      if (r.rows[0].status !== 'draft') {
        throw new ApiError(409, 'Posted GRNs are read-only.');
      }
      await c.query(
        'DELETE FROM public.goods_receipt_lines WHERE receipt_id=$1',
        [rid]
      );
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        // Explicitly protect against undefined array elements.
        if (!l) {
          throw new ApiError(400, 'Invalid receipt line.');
        }
        const p = await c.query(
          `SELECT status, unit_of_measure
           FROM public.products
           WHERE product_id=$1
           FOR SHARE`,
          [l.product_id]
        );
        if (!p.rowCount || !p.rows[0]) {
          throw new ApiError(400, 'All receipt products must be active.');
        }
        const product = p.rows[0];
        if (product.status !== 'active') {
          throw new ApiError(400, 'All receipt products must be active.');
        }
        const check = await c.query(
          `SELECT
            ($1::numeric * $2::numeric) < ($3::numeric * $2::numeric) AS short,
            ($3::numeric * $2::numeric)::text AS base_units`,
          [
            l.expected_packs,
            l.units_per_pack,
            l.received_packs
          ]
        );
        if (!check.rowCount || !check.rows[0]) {
          throw new ApiError(500, 'Unable to validate receipt quantities.');
        }
        const validation = check.rows[0];
        if (validation.short && !l.short_delivery_note) {
          throw new ApiError(400, 'Short-delivery explanation required.');
        }
        if (
          product.unit_of_measure.toLowerCase() === 'each' &&
          !/^\d+(?:\.0+)?$/.test(validation.base_units)
        ) {
          throw new ApiError(
            400,
            'Each-unit products must have whole-number received base units.'
          );
        }
        await c.query(
          `INSERT INTO public.goods_receipt_lines(
            receipt_id,
            line_number,
            product_id,
            expected_packs,
            received_packs,
            units_per_pack,
            unit_cost,
            short_delivery_note
          )
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            rid,
            i + 1,
            l.product_id,
            l.expected_packs,
            l.received_packs,
            l.units_per_pack,
            l.unit_cost,
            l.short_delivery_note
          ]
        );
      }
      return detail(c, rid);
    });
    res.json(result);
  } catch (e) {
    fail(res, e);
  }
}

export async function postReceipt(req: SessionAuthenticatedRequest, res: Response) {
  try {
    const rid = receiptId(req), user = who(req);
    const result = await withTransaction(async c => {
      const r = await c.query(`SELECT * FROM public.goods_receipts WHERE receipt_id=$1 FOR UPDATE`, [rid]);
      if (!r.rowCount) throw new ApiError(404, 'GRN not found.');
      const receipt = r.rows[0];
      if (receipt.status !== 'draft') throw new ApiError(409, 'GRN already posted.');
      await active(c, 'suppliers', 'supplier_id', receipt.supplier_id);
      await active(c, 'locations', 'location_id', receipt.location_id);
      const lines = await c.query(`SELECT line_number,product_id,expected_packs,received_packs,units_per_pack,short_delivery_note, (received_packs*units_per_pack)::text AS base_units FROM public.goods_receipt_lines WHERE receipt_id=$1 ORDER BY product_id`, [rid]);
      if (!lines.rowCount) throw new ApiError(400, 'Add at least one line before posting.');
      const reasons = await c.query<{ reason_code_id: string }>(
        `
          SELECT reason_code_id
          FROM public.reason_codes
          WHERE movement_type = 'RECEIPT'
            AND code = 'SUPPLIER_DELIVERY'
            AND active = true
          LIMIT 1
        `
      );
      const supplierDeliveryReason = reasons.rows[0];
      if (!supplierDeliveryReason) {
        throw new ApiError(
          409,
          'Active SUPPLIER_DELIVERY reason code is missing; configure it before posting.'
        );
      }
      const movements = [];
      for (const l of lines.rows) {
        if (Number(l.received_packs) < Number(l.expected_packs) && !l.short_delivery_note) throw new ApiError(400, 'Short-delivery explanation required.');
        if (Number(l.base_units) === 0) continue;
        const notes = `GRN ${receipt.receipt_no}; delivery ${receipt.delivery_note}; ${l.short_delivery_note ?? ''}`.trim().slice(0, 2000);
        movements.push(
          await postMovement(c, {
            product_id: l.product_id,
            location_id: receipt.location_id,
            user_id: user,
            movement_type: 'RECEIPT',
            quantity: l.base_units,
            reason_code_id: supplierDeliveryReason.reason_code_id,
            reference_no: receipt.receipt_no,
            reference_id: rid,
            notes,
          })
        );
      }
      if (!movements.length) throw new ApiError(400, 'A GRN requires at least one positive received quantity.');
      await c.query(`UPDATE public.goods_receipts SET status='posted',posted_by=$2,posted_at=now(),updated_at=now() WHERE receipt_id=$1`, [rid, user]);
      return { receipt_id: rid, receipt_no: receipt.receipt_no, status: 'posted', movements };
    });
    res.json(result);
  } catch (e) {
    fail(res, e);
  }
}
