import { Router } from 'express';
import {
  startInventoryCount,
  listInventoryCounts,
  getInventoryCount,
  recordCountItems,
  finalizeInventoryCount,
} from '../controllers/inventoryCountController';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';

const router = Router();

// FR-16: Inventory Count - all routes need login
router.use(requireSession);

// POST /api/inventory/counts - Start a count
router.post(
  '/',
  customRequireRole('Manager', 'Inventory Staff'),
  startInventoryCount,
);

// GET /api/inventory/counts - List counts
router.get(
  '/',
  customRequireRole('Manager', 'Inventory Staff'),
  listInventoryCounts,
);

// GET /api/inventory/counts/:id - One count with items + variance
router.get(
  '/:id',
  customRequireRole('Manager', 'Inventory Staff'),
  getInventoryCount,
);

// PATCH /api/inventory/counts/:id/items - Record counted quantities
router.patch(
  '/:id/items',
  customRequireRole('Manager', 'Inventory Staff'),
  recordCountItems,
);

// POST /api/inventory/counts/:id/finalize - Finalize (stricter role)
// Only Manager can finalize - Inventory Staff can record, but not finalize
router.post(
  '/:id/finalize',
  customRequireRole('Manager'),
  finalizeInventoryCount,
);

export default router;