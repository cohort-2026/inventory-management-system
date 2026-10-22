import { Router } from 'express';
import { supabaseRequireAuth, supabaseRequireRoles } from '../auth/supabaseRequireAuth';

const router = Router();

router.get(
  '/',
  supabaseRequireAuth,
  supabaseRequireRoles('manager', 'inventory_staff', 'viewer'),
  (req, res) => {
    res.json({ message: "Products retrieved successfully" });
  }
);

router.post(
  '/',
  supabaseRequireAuth,
  supabaseRequireRoles('manager', 'inventory_staff'),
  (req, res) => {
    res.status(201).json({
      message: "Product created successfully",
    });
  }
);

// Only staff can adjust stock
router.patch(
  '/:id/stock',
  supabaseRequireAuth,
  supabaseRequireRoles('manager', 'inventory_staff'),
  (req, res) => {
    res.json({ message: "Stock updated successfully" });
  }
);

// Only staff can delete products
router.delete(
  '/:id',
  supabaseRequireAuth,
  supabaseRequireRoles('manager', 'inventory_staff'),
  (req, res) => {
    res.json({ message: "Product deleted successfully" });
  }
);

export default router;