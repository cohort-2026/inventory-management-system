import { Router } from 'express';

import { dbPool } from '../db/pool';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';

const router = Router();

type CategoryRow = {
  category_id: string;
  name: string;
  status: string;
};

// GET /api/categories
router.get(
  '/',
  requireSession,
  // Read access. Add any other role that uses the product screens.
  customRequireRole('Manager', 'Inventory Staff', 'Viewer'),
  async (_req, res): Promise<void> => {
    try {
      const result = await dbPool.query<CategoryRow>(
        `
          SELECT
            category_id,
            name,
            status
          FROM public.categories
          ORDER BY name ASC, category_id ASC
        `,
      );

      // An empty table returns 200 with an empty list.
      res.status(200).json({
        items: result.rows,
      });
    } catch (error) {
      console.error(
        'List categories failed:',
        error instanceof Error ? error.message : error,
      );

      res.status(500).json({
        error: 'Unable to load categories.',
      });
    }
  },
);

export default router;