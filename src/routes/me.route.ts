import { Router } from 'express';
import * as orderController from '../controllers/order.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

router.use(protect);

// The payment-history requirement from Stage 0 — a direct, user-scoped query over
// Transaction, independent of order status. See order.service.ts:listTransactions.
router.get('/transactions', orderController.listTransactions);

export default router;