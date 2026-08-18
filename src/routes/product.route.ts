import { Router } from 'express';
import * as productController from '../controllers/product.controller.js';
import { protect, restrictTo, requirePermission, optionalAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import {
  createProductSchema,
  updateProductSchema,
  updateStockSchema,
  getProductSchema,
  listProductsSchema,
  lowStockQuerySchema
} from '../validations/product.validation.js';

const router = Router();

const requireProductManagement = [protect, restrictTo('admin', 'super_admin'), requirePermission('manage_products')];
// Stock changes are gated by a DIFFERENT permission than general product edits — a
// super_admin can grant "can adjust stock" without also granting "can edit prices/
// descriptions", and vice versa. See product.validation.ts for why stock has its own schema.
const requireInventoryManagement = [protect, restrictTo('admin', 'super_admin'), requirePermission('manage_inventory')];

// Public reads — optionalAuth means an admin's token (if sent) unlocks includeInactive,
// but no token at all is required for ordinary browsing.
router.get('/', optionalAuth, validate(listProductsSchema), productController.listProducts);

// NOTE: registered BEFORE '/:id' below. '/low-stock' is a literal path, but Express's
// ':id' param would otherwise happily match the literal string "low-stock" too, since
// both are single path segments — whichever is registered first wins the match.
router.get(
  '/low-stock',
  ...requireInventoryManagement,
  validate(lowStockQuerySchema),
  productController.listLowStockProducts
);

// NOTE: also registered BEFORE '/:id', same reasoning as '/low-stock' above — Express
// would otherwise match the literal "upload-signature" against the ':id' param pattern.
router.post('/upload-signature', ...requireProductManagement, productController.getUploadSignature);

router.get('/:id', optionalAuth, validate(getProductSchema), productController.getProduct);

// Admin writes
router.post('/', ...requireProductManagement, validate(createProductSchema), productController.createProduct);
router.patch('/:id', ...requireProductManagement, validate(updateProductSchema), productController.updateProduct);
router.patch(
  '/:id/stock',
  ...requireInventoryManagement,
  validate(updateStockSchema),
  productController.updateStock
);
router.delete('/:id', ...requireProductManagement, validate(getProductSchema), productController.deleteProduct);

export default router;