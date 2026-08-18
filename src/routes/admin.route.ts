import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { protect, restrictTo } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { inviteAdminSchema, updatePermissionsSchema } from '../validations/admin.validation.js';

const router = Router();

// Every route below requires super_admin specifically — a regular admin cannot create or
// manage other admins, even with every permission flag set.
router.use(protect, restrictTo('super_admin'));

router.post('/admins', validate(inviteAdminSchema), adminController.inviteAdmin);
router.get('/admins', adminController.listAdmins);
router.patch(
  '/admins/:id/permissions',
  validate(updatePermissionsSchema),
  adminController.updatePermissions
);

export default router;