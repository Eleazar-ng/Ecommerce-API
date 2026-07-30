import { Product, Category } from '../models/index.js';
import type { IProduct, IProductImage } from '../models/index.js';
import { NotFoundError } from '../utils/appError.js';
import { generateUniqueSlug } from '../utils/slug.js';

interface ListProductsParams {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  tags?: string;
  page: number;
  limit: number;
  includeInactive: boolean;
  isAdmin: boolean;
}

interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function listProducts(params: ListProductsParams | any): Promise<PaginatedResult<IProduct>> {
  const { search, category, minPrice, maxPrice, tags, page, limit, includeInactive, isAdmin } = params;

  const filter: Record<string, unknown> = {};

  // Only an authenticated admin can ever see inactive products, and only if they explicitly
  // asked for them via includeInactive=true. Every other caller (anonymous or a plain
  // 'user') always gets isActive: true, no exceptions — this is the actual enforcement
  // point for that rule, not just the route-level optionalAuth check.
  if (!isAdmin || !includeInactive) {
    filter.isActive = true;
  }

  if (search) {
    filter.$text = { $search: search };
  }
  if (category) {
    filter.categoryId = category;
  }
  if (tags) {
    filter.tags = { $in: tags.split(',').map((t:any) => t.trim().toLowerCase()) };
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceFilter: Record<string, number> = {};
    if (minPrice !== undefined) priceFilter.$gte = minPrice;
    if (maxPrice !== undefined) priceFilter.$lte = maxPrice;
    filter.priceCents = priceFilter;
  }

  const skip = (page - 1) * limit;

  // When searching, sort by text relevance (Mongoose's $meta projection isn't cleanly
  // typed against a specific document interface, hence the narrow `as any` here — the
  // extra `score` field it adds isn't part of IProduct and nothing downstream reads it).
  let query = Product.find(filter);
  if (search) {
    query = query
      .select({ score: { $meta: 'textScore' } } as any)
      .sort({ score: { $meta: 'textScore' } } as any);
  } else {
    query = query.sort({ createdAt: -1 });
  }

  const [items, total] = await Promise.all([
    query.skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);

  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getProductById(id: string | any, isAdmin: boolean) {
  const product = await Product.findById(id);
  // Same rule as the list endpoint: a deactivated product is invisible to anyone who
  // isn't an admin, including via direct id lookup — not just filtered out of listings.
  if (!product || (!product.isActive && !isAdmin)) {
    throw new NotFoundError('Product not found');
  }
  return product;
}

interface CreateProductParams {
  name: string;
  description?: string;
  priceCents: number;
  stock?: number;
  categoryId: string;
  images?: IProductImage[];
  tags?: string[];
}

export async function createProduct(data: CreateProductParams) {
  const category = await Category.findById(data.categoryId);
  if (!category || !category.isActive) {
    throw new NotFoundError('Category not found');
  }

  const slug = await generateUniqueSlug(Product, data.name);

  return Product.create({ ...data, slug });
}

interface UpdateProductParams {
  name?: string;
  description?: string;
  priceCents?: number;
  categoryId?: string;
  images?: IProductImage[];
  tags?: string[];
  isActive?: boolean;
}

export async function updateProduct(id: string | any, data: UpdateProductParams) {
  const product = await Product.findById(id);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  if (data.categoryId) {
    const category = await Category.findById(data.categoryId);
    if (!category || !category.isActive) {
      throw new NotFoundError('Category not found');
    }
  }

  // Regenerate the slug only if the name actually changed, and only if the freshly
  // generated slug differs from the current one — avoids an unnecessary uniqueness scan
  // on every edit that doesn't touch the name.
  if (data.name && data.name !== product.name) {
    product.slug = await generateUniqueSlug(Product, data.name, product._id.toString());
  }

  Object.assign(product, data);
  await product.save();
  return product;
}

// Deliberately separate from updateProduct — see updateProductSchema's comment.
export async function updateStock(id: string | any, stock: number) {
  const product = await Product.findByIdAndUpdate(id, { stock }, { returnDocument: "after" });
  if (!product) {
    throw new NotFoundError('Product not found');
  }
  return product;
}

// Surfaces products needing restock — sorted lowest-stock-first so the most urgent items
// are at the top. Only ever considers active products; a deactivated product's stock isn't
// operationally relevant.
export async function listLowStockProducts(threshold: number) {
  return Product.find({ isActive: true, stock: { $lte: threshold } }).sort({ stock: 1 });
}

// Soft delete only — never a hard delete. Existing Orders snapshot productId as a
// reference (see Order.ts); deleting the Product document out from under them would
// orphan that reference. isActive: false hides it from customers while keeping history intact.
export async function deleteProduct(id: string | any) {
  const product = await Product.findById(id);
  if (!product) {
    throw new NotFoundError('Product not found');
  }
  product.isActive = false;
  await product.save();
  return product;
}