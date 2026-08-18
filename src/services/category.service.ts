import { Category, Product } from '../models/index.js';
import { NotFoundError, ConflictError } from '../utils/appError.js';
import { generateUniqueSlug } from '../utils/slug.js';

export async function listCategories(includeInactive: boolean) {
  const filter = includeInactive ? {} : { isActive: true };
  return Category.find(filter).sort({ name: 1 });
}

export async function createCategory(name: string) {
  const slug = await generateUniqueSlug(Category, name);
  return Category.create({ name, slug });
}

interface UpdateCategoryParams {
  name?: string;
  isActive?: boolean;
}

export async function updateCategory(id: string|any, data: UpdateCategoryParams) {
  const category = await Category.findById(id);
  if (!category) {
    throw new NotFoundError('Category not found');
  }

  if (data.name && data.name !== category.name) {
    category.slug = await generateUniqueSlug(Category, data.name, category._id.toString());
  }

  Object.assign(category, data);
  await category.save();
  return category;
}

// Blocks deletion if active products still reference this category, rather than orphaning
// their categoryId — same soft-delete philosophy as Product, applied one level up. Admin
// has to explicitly reassign or deactivate those products first, which is the correct
// order of operations (you shouldn't be able to delete a category "out from under" a
// product a customer might currently be browsing).
export async function deleteCategory(id: string|any) {
  const category = await Category.findById(id);
  if (!category) {
    throw new NotFoundError('Category not found');
  }

  const activeProductCount = await Product.countDocuments({ categoryId: id, isActive: true });
  if (activeProductCount > 0) {
    throw new ConflictError(
      `Cannot delete category "${category.name}" — ${activeProductCount} active product(s) still reference it. Reassign or deactivate them first.`
    );
  }

  category.isActive = false;
  await category.save();
  return category;
}