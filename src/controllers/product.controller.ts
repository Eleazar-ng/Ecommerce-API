import * as productService from '../services/product.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { ListProductsQuery } from '../validations/product.validation.js';

function isAdminRole(role?: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

export const listProducts = asyncHandler(async (req, res) => {
  // optionalAuth may or may not have set req.user — see auth.middleware.ts.
  const isAdmin = isAdminRole(req.user?.role);
  // req.query's static type comes from Express, but validate() has already overwritten
  // its runtime contents with the parsed/coerced/defaulted Zod output — this cast bridges
  // that gap rather than re-declaring the shape.
  const query = req.query as unknown as ListProductsQuery;

  const result = await productService.listProducts({
    search: query.search,
    category: query.category,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    tags: query.tags,
    page: query.page,
    limit: query.limit,
    includeInactive: query.includeInactive ?? false,
    isAdmin,
  });

  res.status(200).json({
    success: true,
    data: result.items,
    meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

export const getProduct = asyncHandler(async (req, res) => {
  const isAdmin = isAdminRole(req.user?.role);
  const product = await productService.getProductById(req.params.id, isAdmin);
  res.status(200).json({ success: true, data: product });
});

export const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);
  res.status(201).json({ success: true, data: product });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  res.status(200).json({ success: true, data: product });
});

export const updateStock = asyncHandler(async (req, res) => {
  const product = await productService.updateStock(req.params.id, req.body.stock);
  res.status(200).json({ success: true, data: product });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id);
  res.status(200).json({ success: true, message: 'Product deactivated' });
});