import { Router } from 'express';
import { getInventory } from '../controllers/inventoryController';
import { createInventoryAdjustment } from '../controllers/inventoryAdjustmentController';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';
import { createInventoryTransfer } from '../controllers/inventoryTransferController';
import { getInventoryLevel } from '../controllers/inventoryLevelController';

const router = Router();

// FR-11: View Inventory — existing GET behaviour is preserved.
router.get('/', requireSession, getInventory);
// F01: Check stock quantity for a product at a location.
router.get(
  '/level',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff', 'Viewer'),
  getInventoryLevel,
);

// Stock adjustments: Manager and Inventory Staff only.
router.post(
  '/adjustments',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff'),
  createInventoryAdjustment,
);

// Stock transfers: Manager and Inventory Staff only.
router.post(
  '/transfers',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff'),
  createInventoryTransfer,
);

export default router;
