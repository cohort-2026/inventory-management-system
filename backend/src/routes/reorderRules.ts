
import { Router } from 'express';
import { dbPool } from '../db/pool';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';

const router = Router();

const canRead = [
  requireSession,
  customRequireRole('Manager', 'Inventory Staff', 'Viewer'),
];

const managerOnly = [
  requireSession,
  customRequireRole('Manager'),
];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/products/:id/reorder-rules
// Returns the location-specific reorder rules for a product.
router.get('/:id/reorder-rules', ...canRead, async (req, res) => {
  try {
    const productId = req.params.id;

   if (typeof productId !== 'string' || !UUID_REGEX.test(productId)) {
      return res.status(400).json({
        error: 'Invalid product ID.',
      });
    }

    const productResult = await dbPool.query(
      `SELECT product_id, name, sku, reorder_level
       FROM products
       WHERE product_id = $1`,
      [productId],
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Product not found.',
      });
    }

    const rulesResult = await dbPool.query(
      `SELECT
         rr.reorder_rule_id,
         rr.product_id,
         rr.location_id,
         l.name AS location_name,
         rr.min_quantity,
         rr.max_quantity,
         rr.created_at,
         rr.updated_at
       FROM reorder_rules rr
       INNER JOIN locations l
         ON l.location_id = rr.location_id
       WHERE rr.product_id = $1
       ORDER BY l.name ASC`,
      [productId],
    );

    return res.json({
      product: productResult.rows[0],
      rules: rulesResult.rows,
    });
  } catch (error) {
    console.error('Error fetching reorder rules:', error);

    return res.status(500).json({
      error: 'Failed to fetch reorder rules.',
    });
  }
});

// PUT /api/products/:id/reorder-rules
// Creates or updates a rule for one product and location.
// Only Managers may change reorder rules.
router.put('/:id/reorder-rules', ...managerOnly, async (req, res) => {
  try {
    const productId = req.params.id;
    const { location_id, min_quantity, max_quantity } = req.body;

   if (typeof productId !== 'string' || !UUID_REGEX.test(productId)) {
      return res.status(400).json({
        error: 'Invalid product ID.',
      });
    }

    if (
      typeof location_id !== 'string' ||
      !UUID_REGEX.test(location_id)
    ) {
      return res.status(400).json({
        error: 'A valid location_id is required.',
      });
    }

    if (
      typeof min_quantity !== 'number' ||
      !Number.isFinite(min_quantity) ||
      typeof max_quantity !== 'number' ||
      !Number.isFinite(max_quantity)
    ) {
      return res.status(400).json({
        error: 'Minimum and maximum quantities must be valid numbers.',
      });
    }

    if (min_quantity < 0 || max_quantity < 0) {
      return res.status(400).json({
        error: 'Reorder quantities cannot be negative.',
      });
    }

    if (max_quantity < min_quantity) {
      return res.status(400).json({
        error: 'Maximum quantity must be greater than or equal to minimum quantity.',
        field: 'max_quantity',
      });
    }

    const productResult = await dbPool.query(
      `SELECT product_id
       FROM products
       WHERE product_id = $1`,
      [productId],
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Product not found.',
      });
    }

    const locationResult = await dbPool.query(
      `SELECT location_id
       FROM locations
       WHERE location_id = $1`,
      [location_id],
    );

    if (locationResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Location not found.',
      });
    }

    const result = await dbPool.query(
      `INSERT INTO reorder_rules (
         product_id,
         location_id,
         min_quantity,
         max_quantity
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, location_id)
       DO UPDATE SET
         min_quantity = EXCLUDED.min_quantity,
         max_quantity = EXCLUDED.max_quantity,
         updated_at = NOW()
       RETURNING *`,
      [productId, location_id, min_quantity, max_quantity],
    );

    return res.status(200).json({
      message: 'Reorder rule saved successfully.',
      rule: result.rows[0],
    });
  } catch (error) {
    console.error('Error saving reorder rule:', error);

    return res.status(500).json({
      error: 'Failed to save reorder rule.',
    });
  }
});

export default router;
