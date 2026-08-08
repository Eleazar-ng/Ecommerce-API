import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';

// publicId is what Cloudinary's API actually needs to delete an asset later — the url
// alone isn't reliably reversible back into a publicId. Storing both from the start (set
// once Stage 9's signed-upload flow exists) avoids that gap. See
// docs/deferred-decisions.md (Stage 7 review question about how uploads associate with
// products) for the full reasoning behind this change.
export interface IProductImage {
  url: string;
  publicId: string;
}

export interface IProduct {
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  stock: number;
  categoryId: Types.ObjectId;
  images: IProductImage[];
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ProductDocument = HydratedDocument<IProduct>;

const productImageSchema = new Schema<IProductImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false } // images don't need their own _id — always accessed as part of the product
);

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
    images: {
      type: [productImageSchema],
      default: [],
    },
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
// Stage 12: default GET /products (no search term) filters isActive and sorts by
// createdAt — without this compound index, that's a collection scan + in-memory sort on
// every plain "browse products" request, which is the single most common query this API
// will see.
productSchema.index({ isActive: 1, createdAt: -1 });
// Supports GET /products/low-stock (Stage 8): filters isActive + stock<=threshold, sorted
// by stock ascending.
productSchema.index({ isActive: 1, stock: 1 });

export default mongoose.model<IProduct>('Product', productSchema);