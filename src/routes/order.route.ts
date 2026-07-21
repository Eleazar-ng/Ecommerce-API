import { Router } from 'express';
import * as orderController from '../controllers/order.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { getOrderSchema } from '../validations/order.validation.js';

const router = Router();

router.use(protect);

router.get('/', orderController.listOrders);
router.get('/:id', validate(getOrderSchema), orderController.getOrder);

export default router;