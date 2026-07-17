import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';

export interface IProduct {
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  stock: number;
  categoryId: Types.ObjectId;
  images: string[];
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ProductDocument = HydratedDocument<IProduct>;

const productSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    // Stored in the smallest currency unit (cents), same convention Stripe itself uses.
    // Avoids float rounding entirely — never store price as a Number with decimals.
    priceCents: {
      type: Number,
      required: true,
      min: [0, 'priceCents cannot be negative'],
    },
    stock: {
      type: Number,
      required: true,
      min: [0, 'stock cannot be negative'],
      default: 0,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    images: [
      {
        type: String, // Cloudinary URLs
      },
    ],
    // Free-form labels for filtering/search, distinct from Category — a product has exactly
    // one category but can carry many tags.
    tags: {
      type: [String],
      default: [],
      set: (arr: string[]) => arr.map((t) => t.trim().toLowerCase()), // normalize so "Trail" and "trail" match the same query
    },
    // Soft-delete flag rather than hard delete. Once a product has appeared in even one
    // Order, deleting it would orphan that order's product reference.
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Text index enables $text search across name + description + tags for the product search
// endpoint. Weighting name highest, then tags, then description.
productSchema.index(
  { name: 'text', tags: 'text', description: 'text' },
  { weights: { name: 5, tags: 3, description: 1 } }
);
productSchema.index({ categoryId: 1 });

export default mongoose.model<IProduct>('Product', productSchema);