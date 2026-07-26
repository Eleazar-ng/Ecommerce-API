import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller.js';
import { protect, restrictTo } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { dashboardQuerySchema } from '../validations/dashboard.validation.js';

const router = Router();

// No specific permission required beyond being an admin/super_admin — this is a read-only
// overview, not tied to a specific management action the way manage_products/manage_orders/
// manage_inventory are. Any admin gets baseline visibility into store health.
router.get('/', protect, restrictTo('admin', 'super_admin'), validate(dashboardQuerySchema), dashboardController.getDashboard);

export default router;