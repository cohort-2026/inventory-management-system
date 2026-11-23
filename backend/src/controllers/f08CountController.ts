import type { Response } from 'express';
import type { PoolClient } from 'pg';
import { dbPool } from '../db/pool';
import { withTransaction, TransactionConcurrencyError } from '../db/withTransaction';
import type { RoleAuthenticatedRequest } from '../middleware/customRequireRole';
import { postMovement } from '../services/stockMovementService';
import { StockRuleError } from '../services/stockRules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const EDITABLE = new Set(['DRAFT', 'IN_PROGRESS']);
const HISTORICAL = new Set(['open', 'completed']);

class CountError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'CountError';
  }
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof CountError || error instanceof StockRuleError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  if (error instanceof TransactionConcurrencyError) {
    res.status(503).json({ error: error.message });
    return;
  }
  const pg = error as { code?: string };
  if (pg?.code === '23505') {
    res.status(409).json({ error: 'A duplicate stock count entry was rejected.' });
    return;
  }
  if (pg?.code === '23503' || pg?.code === '23514' || pg?.code === '22P02') {
    res.status(400).json({ error: 'Stock count data violates database validation rules.' });
    return;
  }
  console.error('F08 count request failed:', error);
  res.status(500).json({ error: 'Unable to process stock count request.' });
}

function requireUser(req: RoleAuthenticatedRequest): string {
  const id = req.authenticatedUser?.id;
  if (!id || !UUID.test(id)) throw new CountError(401, 'Authentication required.');
  if (!req.resolvedRole) throw new CountError(403, 'A verified role is required.');
  return id;
}

function countId(req: RoleAuthenticatedRequest): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !UUID.test(id)) {
    throw new CountError(400, 'A valid count UUID is required.');
  }
  return id;
}

function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CountError(400, 'A JSON object is required.');
  }
  return value as Record<string, unknown>;
}

function rejectOtherFields(value: Record<string, unknown>, allowed: string[]): void {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) throw new CountError(400, `Unexpected fields: ${unknown.join(', ')}.`);
}

function parseQuantity(value: unknown): string {
  // Treat quantities as strings, never JS floating-point numbers.
  if (typeof value !== 'string' || value.length > 100 || !DECIMAL.test(value)) {
    throw new CountError(400, 'Counted quantity must be a non-negative decimal string.');
  }
  return value;
}

async function fetchCount(client: PoolClient, id: string, locked = false) {
  const result = await client.query<{
    count_id: string;
    count_no: string;
    location_id: string;
    status: string;
    user_id: string | null;
    note: string | null;
    created_at: Date;
    submitted_at: Date | null;
    submitted_by: string | null;
    recount_round: number;
    legacy_completed: boolean;
  }>(
    `SELECT count_id, count_no, location_id, status, user_id, note,
            created_at, submitted_at, submitted_by, recount_round, legacy_completed
     FROM public.inventory_counts WHERE count_id = $1 ${locked ? 'FOR UPDATE' : ''}`,
    [id],
  );
  const count = result.rows[0];
  if (!count) throw new CountError(404, 'Stock count not found.');
  return count;
}

function checkVisible(role: string, status: string): void {
  if (role === 'Viewer' && status !== 'POSTED' && status !== 'completed') {
    throw new CountError(403, 'Viewer accounts may access posted counts only.');
  }
}

export async function createCount(req: RoleAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = requireUser(req);
    const body = bodyObject(req.body);
    rejectOtherFields(body, ['location_id', 'note']);
    if (typeof body.location_id !== 'string' || !UUID.test(body.location_id)) {
      throw new CountError(400, 'A valid location_id is required.');
    }
    if (body.note != null && (typeof body.note !== 'string' || body.note.length > 2000)) {
      throw new CountError(400, 'note must be at most 2000 characters.');
    }
    const locationId = body.location_id;
    const note = typeof body.note === 'string' ? body.note.trim() || null : null;

    const count = await withTransaction(async client => {
      const location = await client.query<{ status: string }>(
        'SELECT status FROM public.locations WHERE location_id = $1 FOR SHARE',
        [locationId],
      );
      if (!location.rows[0]) throw new CountError(404, 'Location not found.');
      if (location.rows[0].status !== 'active') throw new CountError(400, 'Location is inactive.');

      // A single open F08 count per warehouse avoids simultaneous snapshots.
      // The advisory lock serializes count creation for the same location.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [locationId]);
      const existing = await client.query(
        `SELECT count_id FROM public.inventory_counts
         WHERE location_id = $1 AND status IN ('DRAFT', 'IN_PROGRESS', 'SUBMITTED') LIMIT 1`,
        [locationId],
      );
      if (existing.rowCount) {
        throw new CountError(409, 'This warehouse already has an active F08 count.');
      }

      const created = await client.query(
        `INSERT INTO public.inventory_counts (location_id, note, status, user_id)
         VALUES ($1, $2, 'IN_PROGRESS', $3)
         RETURNING count_id, count_no, location_id, status, user_id, note, created_at,
                   submitted_at, submitted_by, recount_round, legacy_completed`,
        [locationId, note, userId],
      );
      const newCount = created.rows[0];
      if (!newCount) throw new Error('Count creation returned no record.');

      // Include every active product, even when inventory has no row (implicit zero).
      await client.query(
        `INSERT INTO public.inventory_count_items (count_id, product_id, expected_quantity)
         SELECT $1, p.product_id, COALESCE(i.quantity, 0)
         FROM public.products p
         LEFT JOIN public.inventory i
           ON i.product_id = p.product_id AND i.location_id = $2
         WHERE p.status = 'active'
         ORDER BY p.product_id`,
        [newCount.count_id, locationId],
      );
      return newCount;
    });
    res.status(201).json(count);
  } catch (error) {
    respondError(res, error);
  }
}

export async function listCounts(req: RoleAuthenticatedRequest, res: Response): Promise<void> {
  try {
    requireUser(req);
    const viewer = req.resolvedRole === 'Viewer';
    const result = await dbPool.query(
      `SELECT count_id, count_no, location_id, status, note, user_id, created_at,
              submitted_at, submitted_by, recount_round, legacy_completed,
              completed_at, completed_by
       FROM public.inventory_counts
       WHERE ($1::boolean = false OR status IN ('POSTED', 'completed'))
       ORDER BY created_at DESC, count_id DESC LIMIT 500`,
      [viewer],
    );
    res.json(result.rows);
  } catch (error) {
    respondError(res, error);
  }
}

export async function getCount(req: RoleAuthenticatedRequest, res: Response): Promise<void> {
  try {
    requireUser(req);
    const id = countId(req);
    const count = await withTransaction(async client => {
      const record = await fetchCount(client, id);
      checkVisible(req.resolvedRole!, record.status);
      const items = await client.query(
        // No expected_quantity or variance in this response, for any role.
        `SELECT i.product_id, p.name AS product_name, p.sku,
                i.counted_quantity::text AS counted_quantity,
                i.recount_required
         FROM public.inventory_count_items i
         JOIN public.products p ON p.product_id = i.product_id
         WHERE i.count_id = $1 ORDER BY p.name, i.product_id`,
        [id],
      );
      return { count: record, items: items.rows };
    });
    res.json(count);
  } catch (error) {
    respondError(res, error);
  }
}

export async function saveCountItems(req: RoleAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = requireUser(req);
    const id = countId(req);
    const body = bodyObject(req.body);
    rejectOtherFields(body, ['items']);
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 1000) {
      throw new CountError(400, 'items must contain 1 to 1000 counted quantities.');
    }
    const submitted = new Set<string>();
    const items = body.items.map((raw, index) => {
      const value = bodyObject(raw);
      rejectOtherFields(value, ['product_id', 'counted_quantity']);
      if (typeof value.product_id !== 'string' || !UUID.test(value.product_id)) {
        throw new CountError(400, `items[${index}].product_id must be a UUID.`);
      }
      if (submitted.has(value.product_id)) {
        throw new CountError(400, 'Duplicate product in count request.');
      }
      submitted.add(value.product_id);
      return { productId: value.product_id, quantity: parseQuantity(value.counted_quantity) };
    });

    await withTransaction(async client => {
      const count = await fetchCount(client, id, true);
      if (HISTORICAL.has(count.status) || !EDITABLE.has(count.status)) {
        throw new CountError(409, 'This count is read-only or already submitted.');
      }
      const existing = await client.query<{
        product_id: string;
        unit_of_measure: string;
        recount_required: boolean;
      }>(
        `SELECT i.product_id, p.unit_of_measure, i.recount_required
         FROM public.inventory_count_items i
         JOIN public.products p ON p.product_id = i.product_id
         WHERE i.count_id = $1`,
        [id],
      );
      const allowed = new Map(existing.rows.map(row => [row.product_id, row]));
      for (const item of items) {
        const product = allowed.get(item.productId);
        if (!product) throw new CountError(400, 'A product does not belong to this count.');
        if (count.recount_round > 0 && !product.recount_required) {
          throw new CountError(409, 'Only lines requested for recount may be changed.');
        }
        if (product.unit_of_measure.toLowerCase() === 'each' && !/^\d+(?:\.0+)?$/.test(item.quantity)) {
          throw new CountError(400, 'Products measured as each require whole-number quantities.');
        }
      }
      for (const item of items) {
        await client.query(
          `UPDATE public.inventory_count_items
           SET counted_quantity = $3::numeric, counted_by = $4, counted_at = now(),
               recount_completed_at = CASE WHEN recount_required THEN now() ELSE recount_completed_at END
           WHERE count_id = $1 AND product_id = $2`,
          [id, item.productId, item.quantity, userId],
        );
      }
    });
    res.json({ ok: true, saved: items.length });
  } catch (error) {
    respondError(res, error);
  }
}

export async function submitCount(req: RoleAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = requireUser(req);
    const id = countId(req);
    const body = bodyObject(req.body ?? {});
    rejectOtherFields(body, []);
    const result = await withTransaction(async client => {
      const count = await fetchCount(client, id, true);
      if (!EDITABLE.has(count.status)) {
        throw new CountError(409, 'Count is not in an editable state.');
      }
      const stats = await client.query<{
        total: string;
        missing: string;
        recount_pending: string;
      }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE counted_quantity IS NULL)::text AS missing,
                COUNT(*) FILTER (WHERE recount_required AND recount_completed_at IS NULL)::text AS recount_pending
         FROM public.inventory_count_items WHERE count_id = $1`,
        [id],
      );
      const stat = stats.rows[0];
      if (!stat || stat.total === '0') throw new CountError(409, 'Cannot submit an empty count.');
      if (stat.missing !== '0' || stat.recount_pending !== '0') {
        throw new CountError(409, 'All count lines and requested recounts must be completed before submission.');
      }
      const updated = await client.query(
        `UPDATE public.inventory_counts
         SET status = 'SUBMITTED', submitted_at = now(), submitted_by = $2
         WHERE count_id = $1 RETURNING count_id, count_no, status, submitted_at`,
        [id, userId],
      );
      return updated.rows[0];
    });
    res.json(result);
  } catch (error) {
    respondError(res, error);
  }
}

// F08-C will implement these. Explicitly block legacy finalization; never use
// the older direct inventory UPDATE / stock_movements INSERT implementation.
export function postingNotImplemented(_req: RoleAuthenticatedRequest, res: Response): void {
  res.status(409).json({ error: 'F08 posting is disabled until Manager review safeguards are implemented.' });
}

// F08-C review is Manager-only at the router AND controller boundary.
function requireManager(req: RoleAuthenticatedRequest): string {
  const userId = requireUser(req);
  if (req.resolvedRole !== 'Manager') {
    throw new CountError(403, 'Manager approval is required.');
  }
  return userId;
}

type ReviewLine = {
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
};

async function reviewLines(client: PoolClient, id: string): Promise<ReviewLine[]> {
  const result = await client.query<ReviewLine>(
    `SELECT i.product_id, p.name AS product_name, p.sku,
            i.expected_quantity::text AS expected_quantity,
            i.counted_quantity::text AS counted_quantity,
            CASE WHEN i.counted_quantity IS NULL THEN NULL
                 ELSE (i.counted_quantity - i.expected_quantity)::text END AS variance,
            (i.counted_quantity IS NOT NULL AND i.counted_quantity <> i.expected_quantity) AS has_variance,
            CASE WHEN i.counted_quantity IS NULL THEN false
                 ELSE abs(i.counted_quantity - i.expected_quantity) > 5::numeric
                   OR (i.expected_quantity = 0 AND i.counted_quantity <> 0)
                   OR (i.expected_quantity > 0 AND
                       abs(i.counted_quantity - i.expected_quantity) * 100 > i.expected_quantity * 10)
            END AS is_significant,
            i.reason_code_id, i.reason_note, i.recount_required, i.counted_by,
            COALESCE(inv.quantity, 0)::text AS current_quantity,
            (c.status <> 'POSTED' AND COALESCE(inv.quantity, 0) <> i.expected_quantity) AS snapshot_conflict
     FROM public.inventory_count_items i
     JOIN public.inventory_counts c ON c.count_id = i.count_id
     JOIN public.products p ON p.product_id = i.product_id
     LEFT JOIN public.inventory inv
       ON inv.product_id = i.product_id AND inv.location_id = c.location_id
     WHERE i.count_id = $1
     ORDER BY p.name, i.product_id`,
    [id],
  );
  return result.rows;
}

export async function getReview(req: RoleAuthenticatedRequest, res: Response): Promise<void> {
  try {
    requireManager(req);
    const id = countId(req);
    const count = await withTransaction(async client => {
      const record = await fetchCount(client, id);
      if (record.status !== 'SUBMITTED' && record.status !== 'POSTED') {
        throw new CountError(409, 'Only submitted or posted counts may be reviewed.');
      }
      const lines = await reviewLines(client, id);
      return { count: record, items: lines };
    });
    res.json(count);
  } catch (error) {
    respondError(res, error);
  }
}

function parseReviewNote(value: unknown, field: string, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new CountError(400, `${field} is required.`);
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > 2000 || !value.trim()) {
    throw new CountError(400, `${field} must contain 1 to 2000 characters.`);
  }
  return value.trim();
}

export async function saveReviewReasons(req: RoleAuthenticatedRequest, res: Response): Promise<void> {
  try {
    requireManager(req);
    const id = countId(req);
    const body = bodyObject(req.body);
    rejectOtherFields(body, ['items']);
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 1000) {
      throw new CountError(400, 'Provide 1 to 1000 variance reason entries.');
    }
    const seen = new Set<string>();
    const items = body.items.map((raw, index) => {
      const item = bodyObject(raw);
      rejectOtherFields(item, ['product_id', 'reason_code_id', 'reason_note']);
      if (typeof item.product_id !== 'string' || !UUID.test(item.product_id)) {
        throw new CountError(400, `items[${index}].product_id must be a UUID.`);
      }
      if (typeof item.reason_code_id !== 'string' || !UUID.test(item.reason_code_id)) {
        throw new CountError(400, `items[${index}].reason_code_id must be a UUID.`);
      }
      if (seen.has(item.product_id)) throw new CountError(400, 'Duplicate reason entry.');
      seen.add(item.product_id);
      return {
        productId: item.product_id,
        reasonId: item.reason_code_id,
        note: parseReviewNote(item.reason_note, 'reason_note', false),
      };
    });
    await withTransaction(async client => {
      const count = await fetchCount(client, id, true);
      if (count.status !== 'SUBMITTED') throw new CountError(409, 'Review reasons require a submitted count.');
      const lines = await reviewLines(client, id);
      const byProduct = new Map(lines.map(line => [line.product_id, line]));
      const validReasons = await client.query<{
        reason_code_id: string;
        requires_note: boolean;
      }>(
        `SELECT reason_code_id, requires_note FROM public.reason_codes
         WHERE movement_type = 'COUNT_VARIANCE' AND active = true`,
      );
      const reasonMap = new Map(validReasons.rows.map(reason => [reason.reason_code_id, reason]));
      for (const item of items) {
        const line = byProduct.get(item.productId);
        if (!line || !line.has_variance) {
          throw new CountError(400, 'Reasons may only be assigned to counted, nonzero variance lines.');
        }
        const reason = reasonMap.get(item.reasonId);
        if (!reason) throw new CountError(400, 'Invalid or inactive COUNT_VARIANCE reason.');
        if (reason.requires_note && !item.note) {
          throw new CountError(400, 'An explanation is required for the selected reason.');
        }
      }
      for (const item of items) {
        await client.query(
          `UPDATE public.inventory_count_items SET reason_code_id = $3, reason_note = $4
           WHERE count_id = $1 AND product_id = $2`,
          [id, item.productId, item.reasonId, item.note],
        );
      }
    });
    res.json({ ok: true, saved: items.length });
  } catch (error) {
    respondError(res, error);
  }
}

export async function requestRecount(req: RoleAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const managerId = requireManager(req);
    const id = countId(req);
    const body = bodyObject(req.body);
    rejectOtherFields(body, ['product_ids', 'note']);
    if (!Array.isArray(body.product_ids) || body.product_ids.length === 0 || body.product_ids.length > 1000) {
      throw new CountError(400, 'Select at least one product to recount.');
    }
    const productIds = body.product_ids;
    if (productIds.some(value => typeof value !== 'string' || !UUID.test(value)) ||
        new Set(productIds).size !== productIds.length) {
      throw new CountError(400, 'Recount product IDs must be unique UUIDs.');
    }
    const note = parseReviewNote(body.note, 'Recount explanation', true)!;
    const result = await withTransaction(async client => {
      const count = await fetchCount(client, id, true);
      if (count.status !== 'SUBMITTED') throw new CountError(409, 'Only submitted counts can be reopened for recount.');
      const existing = await client.query<{
        product_id: string;
        counted_quantity: string | null;
        counted_by: string | null;
        counted_at: Date | null;
      }>(
        `SELECT product_id, counted_quantity::text AS counted_quantity, counted_by, counted_at
         FROM public.inventory_count_items WHERE count_id = $1 FOR UPDATE`,
        [id],
      );
      const indexed = new Map(existing.rows.map(line => [line.product_id, line]));
      for (const productId of productIds) {
        if (!indexed.has(productId)) throw new CountError(400, 'A requested product does not belong to this count.');
      }
      const nextRound = count.recount_round + 1;
      for (const productId of productIds) {
        const previous = indexed.get(productId)!;
        await client.query(
          `INSERT INTO public.inventory_count_recount_history
           (count_id, product_id, recount_round, previous_counted_quantity,
            previous_counted_by, previous_counted_at, requested_by, request_note)
           VALUES ($1, $2, $3, $4::numeric, $5, $6, $7, $8)`,
          [id, productId, nextRound, previous.counted_quantity, previous.counted_by,
            previous.counted_at, managerId, note],
        );
      }
      await client.query(
        `UPDATE public.inventory_count_items
         SET recount_required = false WHERE count_id = $1`,
        [id],
      );
      await client.query(
        `UPDATE public.inventory_count_items
         SET recount_required = true, recount_round = $3,
             counted_quantity = NULL, counted_by = NULL, counted_at = NULL,
             recount_completed_at = NULL, reason_code_id = NULL, reason_note = NULL
         WHERE count_id = $1 AND product_id = ANY($2::uuid[])`,
        [id, productIds, nextRound],
      );
      await client.query(
        `UPDATE public.inventory_counts
         SET status = 'IN_PROGRESS', recount_round = $2,
             recount_requested_at = now(), recount_requested_by = $3, recount_note = $4,
             submitted_at = NULL, submitted_by = NULL
         WHERE count_id = $1`,
        [id, nextRound, managerId, note],
      );
      return { count_id: id, status: 'IN_PROGRESS', recount_round: nextRound, requested: productIds.length };
    });
    res.json(result);
  } catch (error) {
    respondError(res, error);
  }
}

export async function postCount(req: RoleAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const managerId = requireManager(req);
    const id = countId(req);
    const body = bodyObject(req.body ?? {});
    rejectOtherFields(body, []);
    const result = await withTransaction(async client => {
      const count = await fetchCount(client, id, true);
      if (count.status !== 'SUBMITTED') throw new CountError(409, 'Only submitted counts can be posted.');
      if (count.submitted_by === managerId) {
        throw new CountError(403, 'The counter cannot approve their own count.');
      }

      // Every stock-changing operation locks its product with FOR SHARE.
      // Taking stronger product locks here prevents new receipts/adjustments
      // from changing snapshot balances between comparison and posting.
      const productLocks = await client.query<{ product_id: string }>(
        `SELECT p.product_id FROM public.products p
         JOIN public.inventory_count_items i ON i.product_id = p.product_id
         WHERE i.count_id = $1 ORDER BY p.product_id FOR UPDATE OF p`,
        [id],
      );
      if (!productLocks.rowCount) throw new CountError(409, 'Cannot post a count with no products.');
      const lines = await reviewLines(client, id);
      if (lines.some(line => line.counted_quantity === null)) {
        throw new CountError(409, 'All products must be physically counted before posting.');
      }
      if (lines.some(line => line.counted_by === managerId)) {
        throw new CountError(403, 'A Manager who entered quantities cannot approve the same count.');
      }
      if (lines.some(line => line.snapshot_conflict)) {
        throw new CountError(409, 'Stock changed since the count snapshot. Reconcile new movements before posting.');
      }
      if (lines.some(line => line.has_variance && !line.reason_code_id)) {
        throw new CountError(400, 'Every nonzero variance requires a Manager-selected reason.');
      }

      const reasonIds = [...new Set(lines.map(line => line.reason_code_id).filter((v): v is string => v !== null))];
      const reasonRows = await client.query<{ reason_code_id: string; requires_note: boolean }>(
        `SELECT reason_code_id, requires_note FROM public.reason_codes
         WHERE movement_type = 'COUNT_VARIANCE' AND active = true AND reason_code_id = ANY($1::uuid[])`,
        [reasonIds],
      );
      const reasons = new Map(reasonRows.rows.map(row => [row.reason_code_id, row]));
      for (const line of lines) {
        if (!line.has_variance) continue;
        const reason = line.reason_code_id && reasons.get(line.reason_code_id);
        if (!reason) throw new CountError(400, 'A discrepancy has an invalid or inactive reason.');
        if (reason.requires_note && !line.reason_note?.trim()) {
          throw new CountError(400, 'An explanation is required for the selected discrepancy reason.');
        }
      }

      const posted = [];
      for (const line of lines) {
        if (!line.has_variance) continue;
        // SQL performs exact abs/variance operations; do not use JS Number arithmetic.
        const magnitude = await client.query<{ amount: string; direction: 'increase' | 'decrease' }>(
          `SELECT abs($1::numeric)::text AS amount,
                  CASE WHEN $1::numeric > 0 THEN 'increase' ELSE 'decrease' END AS direction`,
          [line.variance],
        );
        const movement = await postMovement(client, {
          product_id: line.product_id,
          location_id: count.location_id,
          user_id: managerId,
          movement_type: 'COUNT_VARIANCE',
          quantity: magnitude.rows[0]!.amount,
          direction: magnitude.rows[0]!.direction,
          reason_code_id: line.reason_code_id!,
          reference_no: count.count_no,
          reference_id: id,
          notes: line.reason_note || `Approved count ${count.count_no}`,
        });
        posted.push(movement);
      }
      await client.query(
        `UPDATE public.inventory_counts
         SET status = 'POSTED', posted_at = now(), posted_by = $2,
             completed_at = now(), completed_by = $2
         WHERE count_id = $1`,
        [id, managerId],
      );
      return { count_id: id, count_no: count.count_no, status: 'POSTED', movements: posted };
    });
    res.json(result);
  } catch (error) {
    respondError(res, error);
  }
}

export async function listReviewReasons(req: RoleAuthenticatedRequest, res: Response): Promise<void> {
  try {
    requireManager(req);
    const result = await dbPool.query(
      `SELECT reason_code_id, code, label, requires_note
       FROM public.reason_codes
       WHERE movement_type = 'COUNT_VARIANCE' AND active = true
       ORDER BY code`,
    );
    res.json({ items: result.rows });
  } catch (error) {
    respondError(res, error);
  }
}

export async function cancelCount(req: RoleAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const managerId = requireManager(req);
    const id = countId(req);
    const body = bodyObject(req.body ?? {});
    rejectOtherFields(body, ['note']);
    const note = parseReviewNote(body.note, 'Cancellation explanation', true)!;
    const result = await withTransaction(async client => {
      const count = await fetchCount(client, id, true);
      if (!EDITABLE.has(count.status) && count.status !== 'SUBMITTED') {
        throw new CountError(409, 'Only active or submitted counts can be cancelled.');
      }
      const updated = await client.query(
        `UPDATE public.inventory_counts
         SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = $2,
             note = CASE WHEN note IS NULL OR btrim(note) = ''
                         THEN $3 ELSE left(note || E'\\nCancellation: ' || $3, 2000) END
         WHERE count_id = $1 RETURNING count_id, count_no, status`,
        [id, managerId, note],
      );
      return updated.rows[0];
    });
    res.json(result);
  } catch (error) {
    respondError(res, error);
  }
}
