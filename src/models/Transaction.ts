import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';
import crypto from 'crypto';

export type TransactionType = 'payment' | 'refund';
export type TransactionStatus = 'pending' | 'succeeded' | 'failed';

export interface ITransaction {
  reference: string;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  type: TransactionType;
  status: TransactionStatus;
  amountCents: number;
  currency: string;
  stripePaymentIntentId: string;
  stripeEventId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TransactionDocument = HydratedDocument<ITransaction>;

// Generates an internal, human-readable reference — e.g. TXN-20260709-4F8A2C.
// Distinct from stripePaymentIntentId (Stripe's identifier) and stripeEventId (the webhook
// idempotency key): this is YOUR reference, shown on a receipt or searched by support staff.
function generateTransactionReference(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `TXN-${datePart}-${randomPart}`;
}

const transactionSchema = new Schema<ITransaction>(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      default: generateTransactionReference,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      // ASSUMES: Order is always created (status: 'pending') BEFORE the Stripe PaymentIntent
      // is created, so orderId can be passed as PaymentIntent metadata.
    },
    // type/status are deliberately separate fields answering separate questions:
    //   type   = which direction did money move? (payment in, refund out)
    //   status = did this specific attempt succeed?
    // A refund is its own Transaction row, not a status flip on the original payment.
    type: {
      type: String,
      enum: ['payment', 'refund'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed'],
      default: 'pending',
    },
    amountCents: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'usd',
    },
    stripePaymentIntentId: {
      type: String,
      required: true,
    },
    // Stripe WILL send duplicate webhook events. Unique index here is the actual
    // idempotency guard — a duplicate insert throws, which the webhook handler treats as
    // "already processed, no-op" rather than double-fulfilling the order.
    stripeEventId: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, createdAt: -1 }); // supports the payment-history endpoint
transactionSchema.index({ orderId: 1 });
// Stage 12: added once Stage 8's admin transaction listing (filter by status or type,
// sorted by createdAt) was actually built.
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });

export default mongoose.model<ITransaction>('Transaction', transactionSchema);