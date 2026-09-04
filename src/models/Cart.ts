import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';

// Cart items deliberately do NOT snapshot price or name — a cart should always reflect
// the product's current price. Contrast with Order.items, which DOES snapshot — see
// Order.ts for why that's the opposite call.
export interface ICartItem {
  productId: Types.ObjectId;
  quantity: number;
}

export interface ICart {
  userId: Types.ObjectId;
  items: ICartItem[];
  createdAt: Date;
  updatedAt: Date;
}

export type CartDocument = HydratedDocument<ICart>;

const cartItemSchema = new Schema<ICartItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'quantity must be at least 1'],
    },
  },
  { _id: false } // items don't need their own _id — always accessed as part of the cart
);

const cartSchema = new Schema<ICart>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // enforces one active cart per user
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model<ICart>('Cart', cartSchema);