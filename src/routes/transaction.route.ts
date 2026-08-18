import { Router } from 'express';
import * as adminTransactionController from '../controllers/admin.transaction.controller.js';
import { protect, restrictTo, requirePermission } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { adminListTransactionsSchema, getTransactionSchema } from '../validations/transaction.validation.js';

const router = Router();

// view_transactions has existed in AVAILABLE_PERMISSIONS since Stage 3 but was never wired
// to an actual route until now — this is that route. Deliberately its own permission, not
// folded into manage_orders: a support/finance admin might need to SEE payment history
// without being able to manage order fulfillment or issue refunds.
//
// No '/all' sub-path here (unlike order.routes.ts) — this router contains ONLY admin
// routes, nothing user-scoped to disambiguate from. Personal transaction history lives at
// the completely separate /me/transactions (see me.routes.ts), so there's no collision risk.
const requireTransactionView = [protect, restrictTo('admin', 'super_admin'), requirePermission('view_transactions')];

router.get(
  '/',
  ...requireTransactionView,
  validate(adminListTransactionsSchema),
  adminTransactionController.listAllTransactions
);
router.get(
  '/:id',
  ...requireTransactionView,
  validate(getTransactionSchema),
  adminTransactionController.getAnyTransaction
);

export default router;