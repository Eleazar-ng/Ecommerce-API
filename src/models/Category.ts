import mongoose, { Schema, type HydratedDocument } from 'mongoose';

export interface ICategory {
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CategoryDocument = HydratedDocument<ICategory>;

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true, // used in URLs, e.g. /products?category=running-shoes
      lowercase: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true, // soft-hide a category from the storefront without breaking products that reference it
    },
  },
  { timestamps: true }
);

export default mongoose.model<ICategory>('Category', categorySchema);