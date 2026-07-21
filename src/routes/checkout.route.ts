import { Router } from 'express';
import * as checkoutController from '../controllers/checkout.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { checkoutSchema } from '../validations/checkout.validation.js';

const router = Router();

router.post('/', protect, validate(checkoutSchema), checkoutController.checkout);

export default router;