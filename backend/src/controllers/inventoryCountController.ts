import type { Response } from 'express';
import type { SessionAuthenticatedRequest } from '../middleware/requireSession';
import { withTransaction } from '../db/withTransaction';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/inventory/counts
export async function startInventoryCount(req: SessionAuthenticatedRequest, res: Response) {
  const { location_id, note } = req.body ?? {};
  const userId = req.authenticatedUser?.id;

  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  if (typeof location_id !== 'string' || !UUID_REGEX.test(location_id)) {
    return res.status(400).json({ error: 'Valid location_id is required' });
  }

  try {
    const count = await withTransaction(async (client) => {
      const loc = await client.query(
        'SELECT location_id FROM public.locations WHERE location_id = $1',
        [location_id]
      );
      if (loc.rowCount === 0) return null;

      const countRes = await client.query(
        `INSERT INTO public.inventory_counts (location_id, note, status, user_id)
         VALUES ($1, $2, 'open', $3) RETURNING *`,
        [location_id, note ?? null, userId]
      );
      const c = countRes.rows[0];

      // Snapshot: copy current inventory at this location into items
      await client.query(
        `INSERT INTO public.inventory_count_items (count_id, product_id, expected_quantity)
         SELECT $1, product_id, quantity FROM public.inventory WHERE location_id = $2`,
        [c.count_id, location_id]
      );
      return c;
    });

    if (!count) return res.status(404).json({ error: 'Location not found' });
    return res.status(201).json(count);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to start count' }); }
}

// GET /api/inventory/counts/:id
export async function getInventoryCount(req: SessionAuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { rows } = await withTransaction(async (client) => {
    return await client.query(
      `SELECT i.*, p.name as product_name FROM public.inventory_count_items i
       LEFT JOIN public.products p ON p.product_id = i.product_id
       WHERE i.count_id = $1 ORDER BY p.name`,
      [id]
    );
  });
  return res.json(rows);
}

// PATCH /api/inventory/counts/:id/items
export async function recordCountItems(req: SessionAuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { items } = req.body ?? {};
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

  try {
    await withTransaction(async (client) => {
      for (const it of items) {
        await client.query(
          `UPDATE public.inventory_count_items SET counted_quantity = $1
           WHERE count_id = $2 AND product_id = $3`,
          [it.counted_quantity, id, it.product_id]
        );
      }
    });
    return res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to record items' }); }
}

// POST /api/inventory/counts/:id/finalize
export async function finalizeInventoryCount(req: SessionAuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const userId = req.authenticatedUser?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const result = await withTransaction(async (client) => {
      const countRes = await client.query(
        'SELECT * FROM public.inventory_counts WHERE count_id = $1',
        [id]
      );
      if (countRes.rowCount === 0) throw new Error('Count not found');
      const count = countRes.rows[0];
      if (count.status !== 'open') throw new Error('Count already finalized');

      const items = await client.query(
        'SELECT * FROM public.inventory_count_items WHERE count_id = $1 AND counted_quantity IS NOT NULL',
        [id]
      );

      for (const item of items.rows) {
        const diff = Number(item.counted_quantity) - Number(item.expected_quantity);
        if (diff === 0) continue;

        // Get before quantity
        const inv = await client.query(
          'SELECT quantity FROM public.inventory WHERE product_id = $1 AND location_id = $2',
          [item.product_id, count.location_id]
        );
        const before = Number(inv.rows[0]?.quantity ?? 0);

        // Set inventory to counted value
        await client.query(
          `INSERT INTO public.inventory (product_id, location_id, quantity) VALUES ($1, $2, $3)
           ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = $3`,
          [item.product_id, count.location_id, item.counted_quantity]
        );

        await client.query(
          `INSERT INTO public.stock_movements (product_id, location_id, user_id, movement_type, quantity_change, quantity_before, quantity_after, reason, notes)
           VALUES ($1, $2, $3, 'COUNT', $4::numeric, $5::numeric, $6::numeric, 'Inventory count', $7)`,
          [item.product_id, count.location_id, userId, diff, before, item.counted_quantity, `Count ${id}`]
        );
      }

      await client.query(
        `UPDATE public.inventory_counts SET status = 'completed', completed_by = $1, completed_at = NOW() WHERE count_id = $2`,
        [userId, id]
      );
      return { ok: true, adjusted_items: items.rows.length };
    });
    return res.json(result);
  } catch (e: any) { console.error(e); return res.status(400).json({ error: e.message }); }
}

// GET /api/inventory/counts
export async function listInventoryCounts(req: SessionAuthenticatedRequest, res: Response) {
  const { rows } = await withTransaction(async (client) => {
    return await client.query('SELECT * FROM public.inventory_counts ORDER BY created_at DESC');
  });
  return res.json(rows);
}