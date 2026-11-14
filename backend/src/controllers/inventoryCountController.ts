
import type { Response } from 'express';
import type { SessionAuthenticatedRequest } from '../middleware/requireSession';
import { withTransaction } from '../db/withTransaction';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Roles: Manager, Inventory Staff, Viewer.
// The routes also enforce these permissions.
function canMutate(req: SessionAuthenticatedRequest): boolean {
  const user: any = req.authenticatedUser as any;
  const raw =
    user?.role ??
    user?.user_role ??
    user?.roles?.[0] ??
    user?.role_name;

  if (!raw || typeof raw !== 'string') {
    return true;
  }

  const role = raw
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  return (
    role === 'manager' ||
    role === 'inventory staff' ||
    role === 'inventory' ||
    role === 'staff'
  );
}

function requireMutate(
  req: SessionAuthenticatedRequest,
  res: Response,
): boolean {
  if (!canMutate(req)) {
    res.status(403).json({
      error: 'Manager or Inventory Staff only.',
    });
    return false;
  }

  return true;
}

function parseQty(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

    const quantity = Number(trimmed);

    if (!Number.isFinite(quantity) || quantity < 0) {
      return null;
    }

    return quantity;
  }

  return null;
}

function getErrorStatus(error: unknown): number {
  const value = error as { statusCode?: number };
  return value.statusCode ?? 400;
}

function getErrorMessage(error: unknown): string {
  const value = error as { message?: string };
  return value.message ?? 'An unexpected error occurred.';
}

// POST /api/inventory/counts
export async function startInventoryCount(
  req: SessionAuthenticatedRequest,
  res: Response,
) {
  if (!requireMutate(req, res)) return;

  const { location_id, note } = req.body ?? {};
  const userId = req.authenticatedUser?.id;

  if (!userId) {
    return res.status(401).json({
      error: 'Authentication required.',
    });
  }

  if (
    typeof location_id !== 'string' ||
    !UUID_REGEX.test(location_id)
  ) {
    return res.status(400).json({
      error: 'Valid location_id is required.',
    });
  }

  if (
    note !== undefined &&
    note !== null &&
    (typeof note !== 'string' || note.length > 2000)
  ) {
    return res.status(400).json({
      error: 'note must be a string with a maximum of 2000 characters.',
    });
  }

  try {
    const outcome = await withTransaction(async (client) => {
      const locationResult = await client.query(
        `SELECT location_id, status
         FROM public.locations
         WHERE location_id = $1
         FOR UPDATE`,
        [location_id],
      );

      if (locationResult.rowCount === 0) {
        return { status: 404 as const };
      }

      if (
        String(locationResult.rows[0].status).toLowerCase() !==
        'active'
      ) {
        return { status: 400 as const, error: 'Location is inactive.' };
      }

      const countResult = await client.query(
        `INSERT INTO public.inventory_counts
           (location_id, note, status, user_id)
         VALUES ($1, $2, 'open', $3)
         RETURNING *`,
        [
          location_id,
          typeof note === 'string' ? note.trim() || null : null,
          userId,
        ],
      );

      const count = countResult.rows[0];

      await client.query(
        `INSERT INTO public.inventory_count_items
           (count_id, product_id, expected_quantity)
         SELECT $1, product_id, quantity
         FROM public.inventory
         WHERE location_id = $2`,
        [count.count_id, location_id],
      );

      return { status: 201 as const, count };
    });

    if (outcome.status === 404) {
      return res.status(404).json({
        error: 'Location not found.',
      });
    }

    if (outcome.status === 400) {
      return res.status(400).json({
        error: outcome.error,
      });
    }

    return res.status(201).json(outcome.count);
  } catch (error) {
    console.error('Starting inventory count failed:', error);

    return res.status(500).json({
      error: 'Failed to start inventory count.',
    });
  }
}

// GET /api/inventory/counts/:id
// Viewer can read counts.
export async function getInventoryCount(
  req: SessionAuthenticatedRequest,
  res: Response,
) {
  const id = req.params.id;

  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    return res.status(400).json({
      error: 'Invalid count id.',
    });
  }

  try {
    const result = await withTransaction(async (client) => {
      const count = await client.query(
        `SELECT *
         FROM public.inventory_counts
         WHERE count_id = $1`,
        [id],
      );

      if (count.rowCount === 0) return null;

      const items = await client.query(
        `SELECT
           i.*,
           p.name AS product_name
         FROM public.inventory_count_items i
         LEFT JOIN public.products p
           ON p.product_id = i.product_id
         WHERE i.count_id = $1
         ORDER BY p.name`,
        [id],
      );

      return {
        count: count.rows[0],
        items: items.rows,
      };
    });

    if (!result) {
      return res.status(404).json({
        error: 'Count not found.',
      });
    }

    return res.json(result);
  } catch (error) {
    console.error('Getting inventory count failed:', error);

    return res.status(500).json({
      error: 'Failed to get inventory count.',
    });
  }
}

// PATCH /api/inventory/counts/:id/items
export async function recordCountItems(
  req: SessionAuthenticatedRequest,
  res: Response,
) {
  if (!requireMutate(req, res)) return;

  const id = req.params.id;
  const { items } = req.body ?? {};

  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    return res.status(400).json({
      error: 'Invalid count id.',
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'items must be a non-empty array.',
    });
  }

  const submittedProducts = new Set<string>();

  for (const item of items) {
    if (
      !item ||
      typeof item.product_id !== 'string' ||
      !UUID_REGEX.test(item.product_id)
    ) {
      return res.status(400).json({
        error: 'Each item needs a valid product_id UUID.',
      });
    }

    if (submittedProducts.has(item.product_id)) {
      return res.status(400).json({
        error: `Product ${item.product_id} was submitted more than once.`,
      });
    }

    submittedProducts.add(item.product_id);

    if (parseQty(item.counted_quantity) === null) {
      return res.status(400).json({
        error: `Invalid counted_quantity for product ${item.product_id}.`,
      });
    }
  }

  try {
    const outcome = await withTransaction(async (client) => {
      const count = await client.query(
        `SELECT *
         FROM public.inventory_counts
         WHERE count_id = $1
         FOR UPDATE`,
        [id],
      );

      if (count.rowCount === 0) {
        return { status: 404 as const };
      }

      if (count.rows[0].status !== 'open') {
        return {
          status: 409 as const,
          error: 'Count is already finalized and cannot be edited.',
        };
      }

      const existing = await client.query(
        `SELECT
           i.product_id,
           p.unit_of_measure
         FROM public.inventory_count_items i
         JOIN public.products p
           ON p.product_id = i.product_id
         WHERE i.count_id = $1`,
        [id],
      );

      const allowed = new Map(
        existing.rows.map((row) => [
          row.product_id,
          row.unit_of_measure,
        ]),
      );

      for (const item of items) {
        if (!allowed.has(item.product_id)) {
          return {
            status: 400 as const,
            error: `Product ${item.product_id} does not belong to this count.`,
          };
        }

        const quantity = parseQty(item.counted_quantity);
        const unit = String(
          allowed.get(item.product_id) ?? '',
        ).toLowerCase();

        if (unit === 'each' && !Number.isInteger(quantity)) {
          return {
            status: 400 as const,
            error: `Product ${item.product_id} is measured in each and requires a whole-number quantity.`,
          };
        }
      }

      for (const item of items) {
        await client.query(
          `UPDATE public.inventory_count_items
           SET counted_quantity = $1::numeric
           WHERE count_id = $2
             AND product_id = $3`,
          [
            parseQty(item.counted_quantity),
            id,
            item.product_id,
          ],
        );
      }

      return { status: 200 as const };
    });

    if (outcome.status !== 200) {
      return res.status(outcome.status).json({
        error: outcome.error ?? 'Count not found.',
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Recording inventory count items failed:', error);

    return res.status(500).json({
      error: 'Failed to record count items.',
    });
  }
}

// POST /api/inventory/counts/:id/finalize
export async function finalizeInventoryCount(
  req: SessionAuthenticatedRequest,
  res: Response,
) {
  if (!requireMutate(req, res)) return;

  const id = req.params.id;
  const userId = req.authenticatedUser?.id;

  if (!userId) {
    return res.status(401).json({
      error: 'Authentication required.',
    });
  }

  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    return res.status(400).json({
      error: 'Invalid count id.',
    });
  }

  try {
    const result = await withTransaction(async (client) => {
      const countResult = await client.query(
        `SELECT *
         FROM public.inventory_counts
         WHERE count_id = $1
         FOR UPDATE`,
        [id],
      );

      if (countResult.rowCount === 0) {
        throw Object.assign(new Error('Count not found.'), {
          statusCode: 404,
        });
      }

      const count = countResult.rows[0];

      if (count.status !== 'open') {
        throw Object.assign(
          new Error('Count is already finalized.'),
          { statusCode: 409 },
        );
      }

      const locationResult = await client.query(
        `SELECT status
         FROM public.locations
         WHERE location_id = $1
         FOR UPDATE`,
        [count.location_id],
      );

      if (
        locationResult.rowCount === 0 ||
        String(locationResult.rows[0].status).toLowerCase() !==
          'active'
      ) {
        throw Object.assign(
          new Error('The count location is missing or inactive.'),
          { statusCode: 409 },
        );
      }

      const itemsResult = await client.query(
        `SELECT
           i.*,
           p.unit_of_measure
         FROM public.inventory_count_items i
         JOIN public.products p
           ON p.product_id = i.product_id
         WHERE i.count_id = $1
         ORDER BY i.product_id
         FOR UPDATE OF i`,
        [id],
      );

      const items = itemsResult.rows;

      if (items.length === 0) {
        throw Object.assign(
          new Error('Cannot finalize an empty inventory count.'),
          { statusCode: 409 },
        );
      }

      const missing = items.filter(
        (item) =>
          item.counted_quantity === null ||
          item.counted_quantity === undefined,
      );

      if (missing.length > 0) {
        throw Object.assign(
          new Error(
            `Cannot finalize: ${missing.length} product(s) have not been counted.`,
          ),
          { statusCode: 409 },
        );
      }

      let adjustedItems = 0;

      // Find the reason code only when a variance actually exists.
      const reasonResult = await client.query(
        `SELECT reason_code_id
         FROM public.reason_codes
         WHERE movement_type = 'COUNT_VARIANCE'
           AND code = 'STOCK_COUNT_VARIANCE'
           AND active = true`,
      );

      let reasonCodeId: string | null = null;

      for (const item of items) {
        const counted = Number(item.counted_quantity);

        if (!Number.isFinite(counted) || counted < 0) {
          throw Object.assign(
            new Error('A counted quantity is invalid.'),
            { statusCode: 400 },
          );
        }

        const unit = String(
          item.unit_of_measure ?? '',
        ).toLowerCase();

        if (unit === 'each' && !Number.isInteger(counted)) {
          throw Object.assign(
            new Error(
              `Product ${item.product_id} is measured in each and requires a whole-number quantity.`,
            ),
            { statusCode: 400 },
          );
        }

        const inventoryResult = await client.query(
          `SELECT quantity
           FROM public.inventory
           WHERE product_id = $1
             AND location_id = $2
           FOR UPDATE`,
          [item.product_id, count.location_id],
        );

        const before = Number(
          inventoryResult.rows[0]?.quantity ?? 0,
        );

        const after = counted;
        const change = after - before;

        if (change === 0) continue;

        if (reasonResult.rowCount === 0) {
          throw Object.assign(
            new Error(
              'The active STOCK_COUNT_VARIANCE reason code was not found.',
            ),
            { statusCode: 500 },
          );
        }

        if (
          typeof count.note !== 'string' ||
          !count.note.trim()
        ) {
          throw Object.assign(
            new Error(
              'Add a count note explaining the stock difference before finalizing this count.',
            ),
            { statusCode: 400 },
          );
        }

        reasonCodeId = reasonResult.rows[0].reason_code_id;

        await client.query(
          `INSERT INTO public.inventory
             (product_id, location_id, quantity)
           VALUES ($1, $2, $3)
           ON CONFLICT (product_id, location_id)
           DO UPDATE SET quantity = EXCLUDED.quantity`,
          [
            item.product_id,
            count.location_id,
            after,
          ],
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
             reason_code_id,
             reference_id,
             reason,
             notes
           )
           VALUES (
             $1, $2, $3, 'COUNT_VARIANCE',
             $4::numeric, $5::numeric, $6::numeric,
             $7, $8, 'Stock count variance', $9
           )`,
          [
            item.product_id,
            count.location_id,
            userId,
            change,
            before,
            after,
            reasonCodeId,
            id,
            count.note.trim(),
          ],
        );

        adjustedItems += 1;
      }

      await client.query(
        `UPDATE public.inventory_counts
         SET status = 'completed',
             completed_by = $1,
             completed_at = NOW()
         WHERE count_id = $2`,
        [userId, id],
      );

      return {
        ok: true,
        adjusted_items: adjustedItems,
      };
    });

    return res.json(result);
  } catch (error) {
    console.error('Finalizing inventory count failed:', error);

    return res.status(getErrorStatus(error)).json({
      error: getErrorMessage(error),
    });
  }
}

// GET /api/inventory/counts
// Viewer can read counts.
export async function listInventoryCounts(
  req: SessionAuthenticatedRequest,
  res: Response,
) {
  try {
    const result = await withTransaction(async (client) => {
      return client.query(
        `SELECT *
         FROM public.inventory_counts
         ORDER BY created_at DESC`,
      );
    });

    return res.json(result.rows);
  } catch (error) {
    console.error('Listing inventory counts failed:', error);

    return res.status(500).json({
      error: 'Failed to list inventory counts.',
    });
  }
}
