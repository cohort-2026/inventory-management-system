import type { Request, Response } from 'express';
import { dbPool } from '../db/pool';
import {
  calculateInventoryStatus,
  STOCK_STATUS_LABELS,
} from '../services/inventoryStatus';

type InventoryRow = {
  inventory_id: string;
  product_id: string;
  location_id: string;
  name: string;
  sku: string;
  category_id: string;
  location_name: string;
  location_code: string;
  quantity: string | null; // PostgreSQL NUMERIC is returned as text by pg.
  reorder_level: string | null;
  updated_at: Date;
};

function parsePositiveInteger(value: unknown, fallback: number, max: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= max ? parsed : null;
}

// GET /api/inventory — one item for each existing product/location inventory record.
export async function getInventory(req: Request, res: Response): Promise<void> {
  const rawSearch = req.query.search;
  if (rawSearch !== undefined && typeof rawSearch !== 'string') {
    res.status(400).json({ error: 'search must be a single string.' });
    return;
  }

  const search = (rawSearch ?? '').trim();
  if (search.length > 200) {
    res.status(400).json({ error: 'search cannot exceed 200 characters.' });
    return;
  }

  const page = parsePositiveInteger(req.query.page, 1, 1_000_000);
  const pageSize = parsePositiveInteger(req.query.pageSize, 10, 100);
  if (page === null || pageSize === null) {
    res.status(400).json({ error: 'page must be a positive integer and pageSize must be between 1 and 100.' });
    return;
  }

  const offset = (page - 1) * pageSize;

  try {
    // Search is deliberately limited to product name, per the list API issue.
    const condition = `($1::text = '' OR STRPOS(LOWER(p.name), LOWER($1::text)) > 0)`;
    const countResult = await dbPool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM public.inventory AS i
       JOIN public.products AS p ON p.product_id = i.product_id
       JOIN public.locations AS l ON l.location_id = i.location_id
       WHERE ${condition}`,
      [search],
    );

    const rowsResult = await dbPool.query<InventoryRow>(
      `SELECT
         i.inventory_id,
         i.product_id,
         i.location_id,
         p.name,
         p.sku,
         p.category_id,
         l.name AS location_name,
         l.code AS location_code,
         i.quantity::text AS quantity,
         p.reorder_level::text AS reorder_level,
         i.updated_at
       FROM public.inventory AS i
       JOIN public.products AS p ON p.product_id = i.product_id
       JOIN public.locations AS l ON l.location_id = i.location_id
       WHERE ${condition}
       ORDER BY p.name ASC, l.name ASC, i.inventory_id ASC
       LIMIT $2 OFFSET $3`,
      [search, pageSize, offset],
    );

    const items = rowsResult.rows.map((row) => {
      const stockStatus = calculateInventoryStatus(row.quantity, row.reorder_level);
      return {
        id: row.inventory_id,
        inventory_id: row.inventory_id,
        product_id: row.product_id,
        location_id: row.location_id,
        name: row.name,
        sku: row.sku,
        category_id: row.category_id,
        location_name: row.location_name,
        location_code: row.location_code,
        quantity: row.quantity,
        reorder_level: row.reorder_level,
        stock_status: stockStatus,
        status: STOCK_STATUS_LABELS[stockStatus],
        updated_at: row.updated_at,
      };
    });

    res.status(200).json({
      items,
      page,
      pageSize,
      total: Number(countResult.rows[0]?.total ?? '0'),
    });
  } catch (error) {
    // Invalid stored data is a server-side data-integrity failure; do not disguise it as zero.
    console.error('Get inventory failed:', error);
    res.status(500).json({ error: 'Unable to retrieve valid inventory data.' });
  }
}
