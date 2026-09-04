import type { Model } from 'mongoose';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Generates a URL slug from `name`, appending -2, -3, ... if the base slug is already
// taken. Shared between Product and Category since both need identical behavior — a
// generic constrained to "has a slug field" rather than two near-duplicate functions.
export async function generateUniqueSlug<T extends { slug: string }>(
  model: Model<T>,
  name: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let counter = 2;

  // Loop rather than a single "does it exist" check — handles the case where -2 is ALSO
  // taken (e.g. two products both named "Trail Shoes", edited to add a third).
  while (true) {
    const query: Record<string, unknown> = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await model.findOne(query).select('_id').lean();
    if (!existing) return slug;
    slug = `${base}-${counter}`;
    counter++;
  }
}