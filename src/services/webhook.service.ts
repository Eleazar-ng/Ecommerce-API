import type Stripe from 'stripe';
import mongoose from 'mongoose';
import { stripe } from '../config/stripe.js';
import { env } from '../config/env.js';
import { Order, Product, Transaction, Cart } from '../models/index.js';
import { BadRequestError } from '../utils/appError.js';

export function constructStripeEvent(rawBody: Buffer, signature: string): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    // Signature mismatch means either a spoofed request or a wrong/stale webhook secret —
    // either way, reject immediately and never touch the payload. This is the only place
    // in the checkout flow that rejects with 400 rather than acknowledging with 200.
    throw new BadRequestError('Invalid Stripe webhook signature');
  }
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentSucceeded(event);
      break;
    case 'payment_intent.payment_failed':
      await handlePaymentFailed(event);
      break;
    case 'charge.refunded':
      await handleChargeRefunded(event);
      break;  
    default:
      // Stripe sends many event types this app doesn't act on. Acknowledging (not erroring)
      // tells Stripe delivery succeeded, so it won't keep retrying an event we're
      // intentionally ignoring.
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }
}

// True if this specific error is the duplicate-key error from Transaction.stripeEventId's
// unique index — the ENTIRE idempotency mechanism for this webhook handler lives in that
// one index, not in application-level "have I seen this event" bookkeeping.
function isDuplicateEventError(err: unknown): boolean {
  return err instanceof mongoose.mongo.MongoServerError && err.code === 11000;
}

async function handlePaymentSucceeded(event: Stripe.Event): Promise<void> {
  const intent = event.data.object as Stripe.PaymentIntent;
  const orderId = intent.metadata.orderId;
  const userId = intent.metadata.userId;

  if (!orderId || !userId) {
    console.error(`payment_intent.succeeded (${intent.id}) missing orderId/userId metadata`);
    return; // acknowledge — retrying won't add metadata that was never there
  }

  // Cheap pre-check BEFORE opening a transaction: if this exact event was already fully
  // processed, the Transaction row only exists because the WHOLE sequence committed
  // together (see above) — so finding it here means it's safe to no-op without redoing
  // anything. Avoids the overhead of a transaction for the common redelivery case.
  const alreadyProcessed = await Transaction.exists({ stripeEventId: event.id });
  if (alreadyProcessed) {
    console.log(`Duplicate webhook event ${event.id} — already processed, skipping`);
    return;
  }

  const order = await Order.findById(orderId);
  if (!order) {
    console.error(`Order ${orderId} not found for succeeded payment ${intent.id}`);
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => { 
      await Transaction.create(
        [
          {
            userId,
            orderId,
            type: 'payment',
            status: 'succeeded',
            amountCents: intent.amount,
            currency: intent.currency,
            stripePaymentIntentId: intent.id,
            stripeEventId: event.id,
          }
        ],{ session }
      );

      // Only writer of Order.status after creation — see docs/deferred-decisions.md.
      order.status = 'paid';
      await order.save({ session });

      // Stock becomes "real" here. Stage 5 only soft-checked (no decrement); checkout
      // hard-checked but still didn't decrement (to avoid double-counting against an
      // abandoned/failed payment). This is the actual, final decrement.
      //
      // Guarded with stock >= quantity so it can never go negative in the DB. If that guard
      // fails (a genuine race between two simultaneous successful checkouts for the last unit),
      // the order still stands — the customer already paid — but it's logged loudly as an
      // oversold condition for manual reconciliation rather than silently corrupting inventory.
      for (const item of order.items) {
        const result = await Product.updateOne(
          { _id: item.productId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session }
        );
        if (result.matchedCount === 0) {
          console.error(
            `OVERSOLD: order ${order._id.toString()} item ${item.productId.toString()} — ` +
              `stock insufficient or product missing at fulfillment time. Needs manual reconciliation.`
          );
        }
      }

      // Cleared here, not at checkout initiation — consistent with "only the webhook handler
      // owns post-payment state changes." If checkout cleared the cart immediately, a failed
      // payment would leave the user with an empty cart and no easy way to retry.
      await Cart.updateOne({ userId }, { $set: { items: [] } }, { session });
    });

  } catch (err) {
    if (isDuplicateEventError(err)) {
      console.log(`Duplicate webhook event ${event.id} — already processed, skipping`);
      return;
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

async function handlePaymentFailed(event: Stripe.Event): Promise<void> {
  const intent = event.data.object as Stripe.PaymentIntent;
  const orderId = intent.metadata.orderId;
  const userId = intent.metadata.userId;

  if (!orderId || !userId) {
    console.error(`payment_intent.payment_failed (${intent.id}) missing orderId/userId metadata`);
    return;
  }

  const alreadyProcessed = await Transaction.exists({ stripeEventId: event.id });
  if (alreadyProcessed) {
    console.log(`Duplicate webhook event ${event.id} — already processed, skipping`);
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Transaction.create(
        [
          {
            userId,
            orderId,
            type: 'payment',
            status: 'failed',
            amountCents: intent.amount,
            currency: intent.currency,
            stripePaymentIntentId: intent.id,
            stripeEventId: event.id,
          },
        ],
        { session }
      );

      await Order.findByIdAndUpdate(orderId, { status: 'failed' }, { session });
      // Deliberately NOT touching cart or stock — the user should be able to fix their payment
      // method and retry checkout without losing what was in their cart.
    });
  } catch (err) {
    if (isDuplicateEventError(err)) {
      console.log(`Duplicate webhook event ${event.id} (race) — already processed, skipping`);
      return;
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

// Completes the refund flow initiated by admin-order.service.ts's initiateRefund(). That
// function deliberately never touches Order.status itself — this handler does, preserving
// "only the webhook writes Order.status" from Stage 6, now covering the refund path too.
async function handleChargeRefunded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
 
  if (!paymentIntentId) {
    console.error(`charge.refunded (${charge.id}) missing payment_intent reference`);
    return;
  }

  const alreadyProcessed = await Transaction.exists({ stripeEventId: event.id });
  if (alreadyProcessed) {
    console.log(`Duplicate webhook event ${event.id} — already processed, skipping`);
    return;
  }
 
  // Unlike the payment success/failure handlers, there's no metadata round-trip needed
  // here — Order already stores stripePaymentIntentId (set at checkout), so the order can
  // be found directly by matching it against the charge's payment_intent.
  const order = await Order.findOne({ stripePaymentIntentId: paymentIntentId });
  if (!order) {
    console.error(`No order found for refunded charge ${charge.id} (paymentIntent ${paymentIntentId})`);
    return;
  }
 
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Transaction.create(
        [
          {
            userId: order.userId,
            orderId: order._id,
            type: 'refund',
            status: 'succeeded',
            amountCents: charge.amount_refunded,
            currency: charge.currency,
            stripePaymentIntentId: paymentIntentId,
            stripeEventId: event.id,
          },
        ],
        {session}
      );

      // Deliberately NOT restocking inventory automatically — whether a returned/refunded item
      // goes back into sellable stock is a manual, often inspection-dependent decision in real
      // retail operations (was the item actually returned? is it resellable?), not something
      // safe to automate from a webhook alone.
      order.status = 'refunded';
      await order.save({ session });
    })

  } catch (err) {
    if (isDuplicateEventError(err)) {
      console.log(`Duplicate webhook event ${event.id} — already processed, skipping`);
      return;
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
 
 