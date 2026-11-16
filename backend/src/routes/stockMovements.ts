
import { Router } from 'express';
import { getStockMovements } from '../controllers/stockMovementController';
import { createStockMovement } from '../controllers/createStockMovementController';
import { reverseStockMovement } from '../controllers/reverseStockMovementController';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';

const router = Router();

// FR-17: Stock Movement History — read access for all authorised roles.
router.get(
  '/',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff', 'Viewer'),
  getStockMovements,
);

// F01: Create stock movements — Manager and Inventory Staff only.
router.post(
  '/',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff'),
  createStockMovement,
);

// F01: Reverse a stock movement — Managers only.
router.post(
  '/:id/reverse',
  requireSession,
  customRequireRole('Manager'),
  reverseStockMovement,
);

export default router;
