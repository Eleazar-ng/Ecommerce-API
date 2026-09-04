import * as categoryService from '../services/category.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function isAdminRole(role?: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

export const listCategories = asyncHandler(async (req, res) => {
  const isAdmin = isAdminRole(req.user?.role);
  const includeInactive = isAdmin && req.query.includeInactive === 'true';
  const categories = await categoryService.listCategories(includeInactive);
  res.status(200).json({ success: true, data: categories });
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body.name);
  res.status(201).json({ success: true, data: category });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  res.status(200).json({ success: true, data: category });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory(req.params.id);
  res.status(200).json({ success: true, message: 'Category deactivated' });
});