import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';

// Order items ARE a snapshot — name and priceCents are copied at the moment of purchase,
// not referenced live. Once an order is placed it must stay historically accurate even
// if the product is later renamed, repriced, or deactivated. Opposite embedding choice
// from Cart.items, made deliberately for that reason.
export interface IOrderItem {
  productId: Types.ObjectId;
  name: string;
  priceCents: number;
  quantity: number;
}

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'| 'shipped' | 'delivered';

export interface IShippingAddress {
  line1: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export interface IOrder {
  userId: Types.ObjectId;
  items: IOrderItem[];
  totalCents: number;
  status: OrderStatus;
  shippingAddress: IShippingAddress;
  // Set right after the PaymentIntent is created (see checkout.service.ts). Lets the webhook
  // handler cross-check that the event it received actually corresponds to the PaymentIntent
  // this order expects, and makes it easy to look up "does this order already have a payment
  // attempt in flight" without a separate Transaction query.
  stripePaymentIntentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type OrderDocument = HydratedDocument<IOrder>;

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: {
      type: String,
      required: true, // snapshotted, not looked up — protects the receipt if the product is renamed later
    },
    priceCents: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (arr: IOrderItem[]) => arr.length > 0,
        message: 'Order must contain at least one item',
      },
    },
    totalCents: {
      type: Number,
      required: true,
      min: 0,
    },
    // IMPORTANT DESIGN RULE: only the Stripe webhook handler should write this field,
    // driven by the Transaction it just created. No other code path should mutate order
    // status directly — otherwise two writers can race or disagree.
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'cancelled', 'refunded', 'shipped', 'delivered'],
      default: 'pending',
    },
    shippingAddress: {
      line1: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    stripePaymentIntentId: {
      type: String,
    },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 }); // supports "my orders, most recent first"

export default mongoose.model<IOrder>('Order', orderSchema);