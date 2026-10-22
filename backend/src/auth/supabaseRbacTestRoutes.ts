
import { Router } from 'express';

import { supabaseCookieAuth } from './supabaseCookieAuth';

import type {
  RoleAuthenticatedRequest,
} from '../middleware/supabaseRequireRole';

import {
  supabaseRequireRole,
  resolveAuthenticatedRole,
} from '../middleware/supabaseRequireRole';

const router = Router();

// All routes in this test router require authentication.
router.use(supabaseCookieAuth);

// Inspect the authenticated user's assigned role.
router.get('/whoami', async (
  req: RoleAuthenticatedRequest,
  res,
) => {
  const user = req.authenticatedUser;

  if (!user) {
    res.status(401).json({
      error: 'Authentication required',
    });
    return;
  }

  try {
    const role = await resolveAuthenticatedRole(
      user.roleId,
    );

    if (!role) {
      res.status(403).json({
        error: 'No recognized role assigned',
      });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        roleId: user.roleId,
        status: user.status,
      },
      role,
    });
  } catch (error) {
    console.error('Role inspection failed:', error);

    res.status(503).json({
      error: 'Authorization service unavailable',
    });
  }
});

// All three roles may access this route.
router.get(
  '/viewer',
  supabaseRequireRole(
    'Viewer',
    'Inventory Staff',
    'Manager',
  ),
  (_req, res) => {
    res.json({
      message: 'Viewer-level access granted',
    });
  },
);

// Only Inventory Staff and Managers.
router.get(
  '/staff',
  supabaseRequireRole(
    'Inventory Staff',
    'Manager',
  ),
  (_req, res) => {
    res.json({
      message: 'Staff-level access granted',
    });
  },
);

// Managers only.
router.get(
  '/manager',
  supabaseRequireRole('Manager'),
  (_req, res) => {
    res.json({
      message: 'Manager-level access granted',
    });
  },
);

export default router;
