import { Router } from 'express';
import * as categoryController from '../controllers/category.controller.js';
import { protect, restrictTo, requirePermission, optionalAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { createCategorySchema, updateCategorySchema, categoryIdSchema } from '../validations/category.validation.js';

const router = Router();

const requireCategoryManagement = [protect, restrictTo('admin', 'super_admin'), requirePermission('manage_categories')];

router.get('/', optionalAuth, categoryController.listCategories);
router.post('/', ...requireCategoryManagement, validate(createCategorySchema), categoryController.createCategory);
router.patch(
  '/:id',
  ...requireCategoryManagement,
  validate(updateCategorySchema),
  categoryController.updateCategory
);
router.delete(
  '/:id',
  ...requireCategoryManagement,
  validate(categoryIdSchema),
  categoryController.deleteCategory
);

export default router;