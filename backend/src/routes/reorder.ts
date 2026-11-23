
import { Router } from 'express';
import { dbPool } from '../db/pool';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';

const router = Router();

const canRead = [
  requireSession,
  customRequireRole('Manager', 'Inventory Staff', 'Viewer'),
];

// GET /api/reorder
// Optional query parameter: ?location_id=<UUID>
router.get('/', ...canRead, async (req, res) => {
  try {
    const locationId = req.query.location_id;

    if (
      locationId !== undefined &&
      (typeof locationId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationId))
    ) {
      return res.status(400).json({
        error: 'Invalid location_id.',
      });
    }

    const result = await dbPool.query(
      `WITH stock AS (
         SELECT
           product_id,
           location_id,
           SUM(quantity)::numeric AS on_hand
         FROM inventory
         GROUP BY product_id, location_id
       ),
       levels AS (
         SELECT
           p.product_id,
           p.name AS product_name,
           p.sku,
           l.location_id,
           l.name AS location_name,
           COALESCE(rr.min_quantity, p.reorder_level, 0)::numeric AS min_quantity,
           COALESCE(rr.max_quantity, p.reorder_level, 0)::numeric AS max_quantity,
           COALESCE(s.on_hand, 0)::numeric AS on_hand
         FROM products p
         CROSS JOIN locations l
         LEFT JOIN reorder_rules rr
           ON rr.product_id = p.product_id
           AND rr.location_id = l.location_id
         LEFT JOIN stock s
           ON s.product_id = p.product_id
           AND s.location_id = l.location_id
         WHERE l.status = 'active'
       )
       SELECT
         target.product_id,
         target.product_name,
         target.sku,
         target.location_id,
         target.location_name,
         target.on_hand,
         target.min_quantity,
         target.max_quantity,
         (target.max_quantity - target.on_hand)::numeric
           AS recommended_quantity,
         source.location_id AS source_location_id,
         source.location_name AS source_location_name,
         source.on_hand AS source_on_hand,
         source.available_quantity AS source_available_quantity,
         CASE
           WHEN source.location_id IS NOT NULL
             THEN 'Location transfer'
           ELSE 'Supplier required'
         END AS suggested_source
       FROM levels target
       LEFT JOIN LATERAL (
         SELECT
           candidate.location_id,
           candidate.location_name,
           candidate.on_hand,
           (candidate.on_hand - candidate.min_quantity)::numeric
             AS available_quantity
         FROM levels candidate
         WHERE candidate.product_id = target.product_id
           AND candidate.location_id <> target.location_id
           AND candidate.on_hand > candidate.min_quantity
           AND (candidate.on_hand - candidate.min_quantity)
                >= (target.max_quantity - target.on_hand)
         ORDER BY
           (candidate.on_hand - candidate.min_quantity) DESC
         LIMIT 1
       ) source ON TRUE
       WHERE target.on_hand < target.min_quantity
         AND target.max_quantity > target.on_hand
         AND ($1::uuid IS NULL OR target.location_id = $1::uuid)
       ORDER BY
         target.location_name ASC,
         target.product_name ASC`,
      [locationId ?? null],
    );

    return res.json({
      count: result.rows.length,
      reorder_items: result.rows,
    });
  } catch (error) {
    console.error('Error fetching replenishment list:', error);

    return res.status(500).json({
      error: 'Failed to fetch replenishment list.',
    });
  }
});

export default router;
