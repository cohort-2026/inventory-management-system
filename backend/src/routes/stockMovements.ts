import { Router } from 'express';
import { getStockMovements, getStockMovementDetail, exportStockMovementsCsv, getMovementActors } from '../controllers/stockMovementController';
import { createStockMovement } from '../controllers/createStockMovementController';
import { reverseStockMovement } from '../controllers/reverseStockMovementController';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';

const router = Router();
router.use(requireSession);
router.get('/', customRequireRole('Manager', 'Inventory Staff', 'Viewer'), getStockMovements);
router.get('/actors', customRequireRole('Manager', 'Inventory Staff', 'Viewer'), getMovementActors);
router.get('/export.csv', customRequireRole('Manager', 'Inventory Staff', 'Viewer'), exportStockMovementsCsv);
router.get('/:id', customRequireRole('Manager', 'Inventory Staff', 'Viewer'), getStockMovementDetail);
router.post('/', customRequireRole('Manager', 'Inventory Staff'), createStockMovement);
router.post('/:id/reverse', customRequireRole('Manager'), reverseStockMovement);
export default router;
