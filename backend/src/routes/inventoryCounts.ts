import { Router } from 'express';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';
import {
  createCount,
  getCount,
  listCounts,
  saveCountItems,
  submitCount,
  postingNotImplemented,
  getReview,
  listReviewReasons,
  saveReviewReasons,
  requestRecount,
  postCount,
  cancelCount,
} from '../controllers/f08CountController';

const router = Router();
router.use(requireSession);

router.get('/', customRequireRole('Manager', 'Inventory Staff', 'Viewer'), listCounts);
router.post('/', customRequireRole('Manager', 'Inventory Staff'), createCount);
router.get('/review-reasons', customRequireRole('Manager'), listReviewReasons);
router.get('/:id', customRequireRole('Manager', 'Inventory Staff', 'Viewer'), getCount);
router.patch('/:id/items', customRequireRole('Manager', 'Inventory Staff'), saveCountItems);
router.post('/:id/submit', customRequireRole('Manager', 'Inventory Staff'), submitCount);

// Explicitly disable the legacy finalize endpoint for all roles.
router.post('/:id/finalize', customRequireRole('Manager'), postingNotImplemented);
router.get('/:id/review', customRequireRole('Manager'), getReview);
router.patch('/:id/reasons', customRequireRole('Manager'), saveReviewReasons);
router.post('/:id/recount', customRequireRole('Manager'), requestRecount);
router.post('/:id/post', customRequireRole('Manager'), postCount);
router.post('/:id/cancel', customRequireRole('Manager'), cancelCount);

export default router;
