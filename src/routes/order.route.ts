import { Router } from 'express';
import * as orderController from '../controllers/order.controller.js';
import * as adminOrderController from '../controllers/admin.order.controller.js';
import { protect, restrictTo, requirePermission } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import {
  getOrderSchema,
  adminListOrdersSchema,
  updateOrderStatusSchema,
} from '../validations/order.validation.js';

const router = Router();

router.use(protect);

const requireOrderManagement = [restrictTo('admin', 'super_admin'), requirePermission('manage_orders')];

// --- Admin routes, nested under /all ---
// Deliberately NOT mounted under /admin — that path is reserved exclusively for
// super_admin admin-account management (see admin.routes.ts), which would wrongly lock
// out a regular admin with manage_orders permission. Nesting these under /orders/all also
// means they're structurally distinct from /orders/:id (3+ path segments vs 2), so there's
// no risk of "all" being swallowed by the :id param pattern the way a bare /orders/admin
// would have been.
router.get(
  '/all',
  ...requireOrderManagement,
  validate(adminListOrdersSchema),
  adminOrderController.listAllOrders
);
router.get(
  '/all/:id',
  ...requireOrderManagement,
  validate(getOrderSchema),
  adminOrderController.getAnyOrder
);
router.patch(
  '/all/:id/status',
  ...requireOrderManagement,
  validate(updateOrderStatusSchema),
  adminOrderController.updateOrderStatus
);
router.post(
  '/all/:id/refund',
  ...requireOrderManagement,
  validate(getOrderSchema),
  adminOrderController.refundOrder
);

// --- User-scoped routes ---
router.get('/', orderController.listOrders);
router.get('/:id', validate(getOrderSchema), orderController.getOrder);

export default router;