import { Router } from 'express';
import { getInventory } from '../controllers/inventoryController';
import { createInventoryAdjustment } from '../controllers/inventoryAdjustmentController';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';
import { createInventoryTransfer } from '../controllers/inventoryTransferController';

const router = Router();

// FR-11: View Inventory — existing GET behaviour is preserved.
router.get('/', requireSession, getInventory);

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
