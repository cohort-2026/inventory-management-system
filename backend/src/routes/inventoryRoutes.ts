import { Router } from 'express';

import { dbPool } from '../db/pool';
import { customRequireRole } from '../middleware/customRequireRole';
import { requireSession } from '../middleware/requireSession';

const router = Router();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ADJUSTMENT_REASONS = new Set([
  'recount',
  'damage',
  'received',
]);

type InventoryRow = {
  inventory_id: string;
  product_id: string;
  location_id: string;
  quantity: string;
  product_name: string;
  product_sku: string;
  location_name: string;
};

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

router.get(
  '/',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff', 'Viewer'),
  async (_req, res): Promise<void> => {
    try {
      const result = await dbPool.query<InventoryRow>(
        `
          SELECT
            i.inventory_id,
            i.product_id,
            i.location_id,
            i.quantity,
            p.name AS product_name,
            p.sku AS product_sku,
            l.name AS location_name
          FROM public.inventory AS i
          INNER JOIN public.products AS p
            ON p.product_id = i.product_id
          INNER JOIN public.locations AS l
            ON l.location_id = i.location_id
          WHERE p.status = 'active'
            AND l.status = 'active'
          ORDER BY p.name, l.name
        `,
      );

      res.status(200).json({
        inventory: result.rows,
      });
    } catch (error) {
      console.error(
        'List inventory failed:',
        error instanceof Error ? error.message : error,
      );

      res.status(500).json({
        error: 'Unable to retrieve inventory.',
      });
    }
  },
);

router.patch(
  '/adjust',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff'),
  async (req, res): Promise<void> => {
    if (!isObject(req.body)) {
      res.status(400).json({
        error: 'Request body must be a JSON object.',
      });
      return;
    }

    const allowedFields = new Set([
      'product_id',
      'location_id',
      'adjustment',
      'reason',
      'notes',
    ]);
    const unknownFields = Object.keys(req.body).filter(
      (field) => !allowedFields.has(field),
    );

    if (unknownFields.length > 0) {
      res.status(400).json({
        error: `Unknown field(s): ${unknownFields.join(', ')}.`,
      });
      return;
    }

    const {
      product_id: productId,
      location_id: locationId,
      adjustment,
      reason,
      notes,
    } = req.body;

    if (
      typeof productId !== 'string' ||
      !UUID_PATTERN.test(productId)
    ) {
      res.status(400).json({
        error: 'product_id must be a valid UUID.',
      });
      return;
    }

    if (
      typeof locationId !== 'string' ||
      !UUID_PATTERN.test(locationId)
    ) {
      res.status(400).json({
        error: 'location_id must be a valid UUID.',
      });
      return;
    }

    if (
      typeof adjustment !== 'number' ||
      !Number.isFinite(adjustment) ||
      adjustment === 0
    ) {
      res.status(400).json({
        error: 'adjustment must be a non-zero number.',
      });
      return;
    }

    if (
      typeof reason !== 'string' ||
      !ADJUSTMENT_REASONS.has(reason)
    ) {
      res.status(400).json({
        error: 'Select a valid adjustment reason.',
      });
      return;
    }

    if (
      notes !== undefined &&
      typeof notes !== 'string'
    ) {
      res.status(400).json({
        error: 'notes must be a string.',
      });
      return;
    }

    const cleanNotes =
      typeof notes === 'string' ? notes.trim() : '';

    if (cleanNotes.length > 2000) {
      res.status(400).json({
        error: 'notes must not exceed 2000 characters.',
      });
      return;
    }

    const userId = req.authenticatedUser?.id;
    if (!userId) {
      res.status(401).json({
        error: 'Authentication required.',
      });
      return;
    }

    const client = await dbPool.connect();

    try {
      await client.query('BEGIN');

      const references = await client.query(
        `
          SELECT p.product_id, l.location_id
          FROM public.products AS p
          CROSS JOIN public.locations AS l
          WHERE p.product_id = $1
            AND p.status = 'active'
            AND l.location_id = $2
            AND l.status = 'active'
          FOR SHARE OF p, l
        `,
        [productId, locationId],
      );

      if (references.rowCount !== 1) {
        await client.query('ROLLBACK');
        res.status(404).json({
          error: 'The selected active product or location was not found.',
        });
        return;
      }

      await client.query(
        `
          INSERT INTO public.inventory (
            product_id,
            location_id,
            quantity
          )
          VALUES ($1, $2, 0)
          ON CONFLICT (product_id, location_id) DO NOTHING
        `,
        [productId, locationId],
      );

      const current = await client.query<{
        inventory_id: string;
        quantity: string;
      }>(
        `
          SELECT inventory_id, quantity
          FROM public.inventory
          WHERE product_id = $1
            AND location_id = $2
          FOR UPDATE
        `,
        [productId, locationId],
      );

      const inventory = current.rows[0];
      if (!inventory) {
        throw new Error('Inventory row was not available after insert.');
      }

      const quantityBefore = Number(inventory.quantity);
      const quantityAfter = quantityBefore + adjustment;

      if (quantityAfter < 0) {
        await client.query('ROLLBACK');
        res.status(400).json({
          error: 'The adjustment cannot reduce stock below zero.',
        });
        return;
      }

      await client.query(
        `
          UPDATE public.inventory
          SET quantity = $1,
              updated_at = now()
          WHERE inventory_id = $2
        `,
        [quantityAfter, inventory.inventory_id],
      );

      await client.query(
        `
          INSERT INTO public.stock_movements (
            product_id,
            location_id,
            user_id,
            movement_type,
            quantity_change,
            quantity_before,
            quantity_after,
            reason,
            notes
          )
          VALUES ($1, $2, $3, 'ADJUSTMENT', $4, $5, $6, $7, $8)
        `,
        [
          productId,
          locationId,
          userId,
          adjustment,
          quantityBefore,
          quantityAfter,
          reason,
          cleanNotes || null,
        ],
      );

      const updated = await client.query<InventoryRow>(
        `
          SELECT
            i.inventory_id,
            i.product_id,
            i.location_id,
            i.quantity,
            p.name AS product_name,
            p.sku AS product_sku,
            l.name AS location_name
          FROM public.inventory AS i
          INNER JOIN public.products AS p
            ON p.product_id = i.product_id
          INNER JOIN public.locations AS l
            ON l.location_id = i.location_id
          WHERE i.inventory_id = $1
        `,
        [inventory.inventory_id],
      );

      await client.query('COMMIT');

      res.status(200).json({
        message: 'Stock adjustment confirmed.',
        inventory: updated.rows[0],
      });
    } catch (error) {
      await client.query('ROLLBACK').catch((rollbackError: unknown) => {
        console.error(
          'Rollback stock adjustment failed:',
          rollbackError instanceof Error
            ? rollbackError.message
            : rollbackError,
        );
      });

      console.error(
        'Adjust stock failed:',
        error instanceof Error ? error.message : error,
      );

      res.status(500).json({
        error: 'Unable to adjust stock.',
      });
    } finally {
      client.release();
    }
  },
);

export default router;
