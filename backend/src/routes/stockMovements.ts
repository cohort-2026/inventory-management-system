
import { Router } from 'express';
import { getStockMovements } from '../controllers/stockMovementController';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';

const router = Router();

// FR-17: Stock Movement History — read-only access.
router.get(
  '/',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff', 'Viewer'),
  getStockMovements,
);

export default router;
