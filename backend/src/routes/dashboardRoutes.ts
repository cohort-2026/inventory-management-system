
import { Router } from 'express';
import { getDashboardSummary } from '../controllers/dashboardController';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';

const router = Router();

router.use(requireSession);
router.use(customRequireRole('Manager', 'Inventory Staff', 'Viewer'));

router.get('/summary', getDashboardSummary);

export default router;
