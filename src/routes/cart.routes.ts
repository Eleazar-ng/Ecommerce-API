import { Router } from 'express';
import * as cartController from '../controllers/cart.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { addItemSchema, updateItemSchema, removeItemSchema } from '../validations/cart.validation.js';

const router = Router();

router.use(protect); // every cart route requires a logged-in user — carts are per-user, not guest-accessible

router.get('/', cartController.getCart);
router.post('/items', validate(addItemSchema), cartController.addItem);
router.patch('/items/:productId', validate(updateItemSchema), cartController.updateItem);
router.delete('/items/:productId', validate(removeItemSchema), cartController.removeItem);
router.delete('/', cartController.clearCart);

export default router;