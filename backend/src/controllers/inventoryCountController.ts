import type { Response } from 'express';
import type { SessionAuthenticatedRequest } from '../middleware/requireSession';
import { withTransaction } from '../db/withTransaction';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Permissions ---
// Roles: Manager, Inventory Staff, Viewer
// Manager + Inventory Staff = can create / edit / finalize
// Viewer = read-only (GET only, gets 403 on mutations)
function canMutate(req: SessionAuthenticatedRequest): boolean {
  const user: any = req.authenticatedUser as any;
  const raw = user?.role ?? user?.user_role ?? user?.roles?.[0] ?? user?.role_name;
  if (!raw || typeof raw !== 'string') {
    // No role on user = we can't enforce yet. Keep while testing.
    // Once roles are confirmed coming through, change this to: return false;
    return true;
  }
  const role = raw.toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  // Normalised: 'manager', 'inventory staff', 'viewer'
  if (role === 'manager') return true;
  if (role === 'inventory staff' || role === 'inventory' || role === 'staff') return true;
  // Viewer + anything else = read-only
  return false;
}

function requireMutate(req: SessionAuthenticatedRequest, res: Response): boolean {
  if (!canMutate(req)) {
    res.status(403).json({ error: 'Manager or Inventory Staff only.' });
    return false;
  }
  return true;
}

function parseQty(v: unknown): number | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) return null;
    return v;
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }
  return null;
}

// POST /api/inventory/counts
export async function startInventoryCount(req: SessionAuthenticatedRequest, res: Response) {
  if (!requireMutate(req, res)) return;
  const { location_id, note } = req.body ?? {};
  const userId = req.authenticatedUser?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  if (typeof location_id !== 'string' || !UUID_REGEX.test(location_id)) {
    return res.status(400).json({ error: 'Valid location_id is required' });
  }
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 2000)) {
    return res.status(400).json({ error: 'note must be a string max 2000 chars' });
  }

  try {
    const count = await withTransaction(async (client) => {
      const loc = await client.query('SELECT location_id FROM public.locations WHERE location_id = $1', [location_id]);
      if (loc.rowCount === 0) return null;
      const c = await client.query(
        `INSERT INTO public.inventory_counts (location_id, note, status, user_id)
         VALUES ($1, $2, 'open', $3) RETURNING *`,
        [location_id, note ?? null, userId]
      );
      await client.query(
        `INSERT INTO public.inventory_count_items (count_id, product_id, expected_quantity)
         SELECT $1, product_id, quantity FROM public.inventory WHERE location_id = $2`,
        [c.rows[0].count_id, location_id]
      );
      return c.rows[0];
    });
    if (!count) return res.status(404).json({ error: 'Location not found' });
    if (count === 'inactive') return res.status(400).json({ error: 'Location is inactive.' });
    return res.status(201).json(count);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to start count' }); }
}

// GET /api/inventory/counts/:id
// Returns parent count + items. Viewer CAN call this.
export async function getInventoryCount(req: SessionAuthenticatedRequest, res: Response) {
  const id = req.params.id;
   if (typeof id !== 'string' || !UUID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid count id' });
  const result = await withTransaction(async (client) => {
    const count = await client.query('SELECT * FROM public.inventory_counts WHERE count_id = $1', [id]);
    if (count.rowCount === 0) return null;
    const items = await client.query(
      `SELECT i.*, p.name AS product_name FROM public.inventory_count_items i
       LEFT JOIN public.products p ON p.product_id = i.product_id
       WHERE i.count_id = $1 ORDER BY p.name`,
      [id]
    );
    return { count: count.rows[0], items: items.rows };
  });
  if (!result) return res.status(404).json({ error: 'Count not found' });
  return res.json(result);
}

// PATCH /api/inventory/counts/:id/items
// FIX 1: rejects edits to completed counts with 409
// FIX 3: rejects negative / non-numeric / malformed quantities with 400, verifies product belongs to count
export async function recordCountItems(req: SessionAuthenticatedRequest, res: Response) {
  if (!requireMutate(req, res)) return;
  const id = req.params.id;
  const { items } = req.body ?? {};
  if (typeof id !== 'string' || !UUID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid count id' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items must be a non-empty array' });

  // Validate ALL entries before touching DB
  for (const it of items) {
    if (!it || typeof it.product_id !== 'string' || !UUID_REGEX.test(it.product_id)) {
      return res.status(400).json({ error: 'Each item needs a valid product_id UUID' });
    }
    if (parseQty(it.counted_quantity) === null) {
      return res.status(400).json({ error: `Invalid counted_quantity for product ${it.product_id}: must be a non-negative number` });
    }
  }

  try {
    const outcome = await withTransaction(async (client) => {
      // Lock count row - prevents finalize racing with edit
      const count = await client.query(
        'SELECT * FROM public.inventory_counts WHERE count_id = $1 FOR UPDATE',
        [id]
      );
      if (count.rowCount === 0) return { status: 404 as const };
      if (count.rows[0].status !== 'open') return { status: 409 as const, error: 'Count is already finalized and cannot be edited.' };

      // Verify every product belongs to this count
      const existing = await client.query(
        'SELECT product_id FROM public.inventory_count_items WHERE count_id = $1',
        [id]
      );
      const allowed = new Set(existing.rows.map(r => r.product_id));
      for (const it of items) {
        if (!allowed.has(it.product_id)) {
          return { status: 400 as const, error: `Product ${it.product_id} does not belong to this count.` };
        }
      }
      for (const it of items) {
        const upd = await client.query(
          `UPDATE public.inventory_count_items SET counted_quantity = $1::numeric
           WHERE count_id = $2 AND product_id = $3`,
          [parseQty(it.counted_quantity), id, it.product_id]
        );
        if (upd.rowCount === 0) return { status: 400 as const, error: `Product ${it.product_id} not found in count.` };
      }
      return { status: 200 as const };
    });
    if (outcome.status !== 200) return res.status(outcome.status).json({ error: outcome.error ?? 'Not found' });
    return res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to record items' }); }
}

// POST /api/inventory/counts/:id/finalize
// FIX 2: change = counted - ACTUAL current stock, so quantity_after = quantity_before + quantity_change always holds
// FIX 4: all products must be counted, otherwise 409
// FIX 6: locks count + inventory rows in one transaction, second finalize gets 409
export async function finalizeInventoryCount(req: SessionAuthenticatedRequest, res: Response) {
  if (!requireMutate(req, res)) return;
 const id = req.params.id;
 const userId = req.authenticatedUser?.id;
 if (!userId) return res.status(401).json({ error: 'Authentication required.' });
 if (typeof id !== 'string' || !UUID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid count id' });

  try {
    const result = await withTransaction(async (client) => {
      // Lock count row FIRST. Second simultaneous finalize will wait, then see status != open and get 409.
      const countRes = await client.query(
        'SELECT * FROM public.inventory_counts WHERE count_id = $1 FOR UPDATE',
        [id]
      );
      if (countRes.rowCount === 0) throw Object.assign(new Error('Count not found'), { statusCode: 404 });
      const count = countRes.rows[0];
      if (count.status !== 'open') throw Object.assign(new Error('Count already finalized'), { statusCode: 409 });

      const itemsRes = await client.query(
        'SELECT * FROM public.inventory_count_items WHERE count_id = $1 ORDER BY product_id FOR UPDATE',
        [id]
      );

      // All products must be counted
      const missing = itemsRes.rows.filter(r => r.counted_quantity === null || r.counted_quantity === undefined);
      if (missing.length > 0) {
        throw Object.assign(
          new Error(`Cannot finalize: ${missing.length} product(s) not yet counted: ${missing.map(m => m.product_id).join(', ')}`),
          { statusCode: 409 }
        );
      }

      for (const item of itemsRes.rows) {
        // Lock inventory row for this product/location
        const inv = await client.query(
          'SELECT quantity FROM public.inventory WHERE product_id = $1 AND location_id = $2 FOR UPDATE',
          [item.product_id, count.location_id]
        );
        const before = Number(inv.rows[0]?.quantity ?? 0);
        const after = Number(item.counted_quantity);
        // Change derived from ACTUAL current stock, not stale expected_quantity
        const change = after - before;
        if (change === 0) continue;

        await client.query(
          `INSERT INTO public.inventory (product_id, location_id, quantity) VALUES ($1, $2, $3)
           ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = $3`,
          [item.product_id, count.location_id, after]
        );
       await client.query(
         `INSERT INTO public.stock_movements (
          product_id,
          location_id,
          user_id,
          movement_type,
          quantity_change,
          quantity_before,
          quantity_after,
          reference_id,
          reason,
          notes
         )
         VALUES ($1, $2, $3, 'COUNT', $4::numeric, $5::numeric, $6::numeric, $7, 'Inventory count', $8)`,
         [
             item.product_id,
             count.location_id,
             userId,
             change,
             before,
             after,
             id,
          `Count ${id}`,
         ]
        );
     }

      await client.query(
        `UPDATE public.inventory_counts SET status = 'completed', completed_by = $1, completed_at = NOW() WHERE count_id = $2`,
        [userId, id]
      );
      return { ok: true, adjusted_items: itemsRes.rows.length };
    });
    return res.json(result);
  } catch (e: any) {
    console.error(e);
    return res.status(e.statusCode ?? 400).json({ error: e.message });
  }
}

// GET /api/inventory/counts
// Viewer CAN call this - list is read-only
export async function listInventoryCounts(req: SessionAuthenticatedRequest, res: Response) {
  const { rows } = await withTransaction(async (client) => {
    return await client.query('SELECT * FROM public.inventory_counts ORDER BY created_at DESC');
  });
  return res.json(rows);
}