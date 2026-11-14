
import type { Request, Response } from 'express';
import { dbPool } from '../db/pool';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getInventoryLevel(
  req: Request,
  res: Response,
): Promise<void> {
  const productId = req.query.product_id;
  const locationId = req.query.location_id;

  if (typeof productId !== 'string' || !UUID_REGEX.test(productId)) {
    res.status(400).json({
      error: 'product_id must be a valid UUID.',
    });
    return;
  }

  if (typeof locationId !== 'string' || !UUID_REGEX.test(locationId)) {
    res.status(400).json({
      error: 'location_id must be a valid UUID.',
    });
    return;
  }

  try {
    const [productResult, locationResult] = await Promise.all([
      dbPool.query<{
        product_id: string;
        unit_of_measure: string;
        status: string;
      }>(
        `SELECT product_id, unit_of_measure, status
         FROM public.products
         WHERE product_id = $1`,
        [productId],
      ),
      dbPool.query<{
        location_id: string;
        name: string;
        status: string;
      }>(
        `SELECT location_id, name, status
         FROM public.locations
         WHERE location_id = $1`,
        [locationId],
      ),
    ]);

    const product = productResult.rows[0];

    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const location = locationResult.rows[0];

    if (!location) {
      res.status(404).json({ error: 'Location not found.' });
      return;
    }

    const inventoryResult = await dbPool.query<{
      quantity: string;
      updated_at: Date | null;
    }>(
      `SELECT quantity::text AS quantity, updated_at
       FROM public.inventory
       WHERE product_id = $1
         AND location_id = $2`,
      [productId, locationId],
    );

    const inventory = inventoryResult.rows[0];

    res.status(200).json({
      product_id: product.product_id,
      location_id: location.location_id,
      location_name: location.name,
      quantity: inventory?.quantity ?? '0',
      unit_of_measure: product.unit_of_measure,
      product_status: product.status,
      location_status: location.status,
      updated_at: inventory?.updated_at ?? null,
    });
  } catch (error) {
    console.error('Fetching inventory level failed:', error);

    res.status(500).json({
      error: 'Unable to retrieve inventory level.',
    });
  }
}
