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

// --- Stage 11: every multi-write handler below runs inside a MongoDB transaction. ---
// Previously, each handler did its writes as separate, independent operations (Transaction
// insert, then Order update, then stock decrements, then cart clear). If the process was
// killed between any two of those steps — a hard SIGKILL after the graceful-shutdown
// timeout, a crash, a hosting platform yanking the process — the result was a half-applied
// webhook: e.g. a Transaction row existing but Order.status still stuck on 'pending'
// forever, because a Stripe redelivery of the same event would hit the stripeEventId
// idempotency guard and silently no-op, never retrying the work that never finished.
//
// Wrapping each handler's full write sequence in a session.withTransaction() call fixes
// this at the root: either EVERY write in the sequence commits, or NONE of them do. A
// process killed mid-transaction just means MongoDB rolls back the uncommitted transaction
// automatically — so a Stripe redelivery finds no Transaction row yet (since it was never
// committed) and correctly redoes the entire sequence from scratch. This requires MongoDB
// running as a replica set (even single-node) — transactions aren't supported against a
// standalone mongod. See docs/deferred-decisions.md for local setup steps.

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
      //
      // Stage 12: batched into a single bulkWrite() instead of N sequential updateOne()
      // calls (one per line item) — an order with, say, 5 different products previously
      // meant 5 separate network round-trips to MongoDB inside this transaction; now it's
      // one. Each op still carries its own stock >= quantity guard, so it can never go
      // negative in the DB. If any individual op's guard fails (a genuine race between two
      // simultaneous successful checkouts for the last unit), the order still stands — the
      // customer already paid — but it's logged loudly as an oversold condition for manual
      // reconciliation rather than silently corrupting inventory. This oversell guard is
      // independent of the transaction: it's a legitimate business conflict, not a failure
      // to roll back.
     if (order.items.length > 0) {
        const stockDecrementOps = order.items.map((item) => ({
          updateOne: {
            filter: { _id: item.productId, stock: { $gte: item.quantity } },
            update: { $inc: { stock: -item.quantity } },
          },
        }));
 
        const bulkResult = await Product.bulkWrite(stockDecrementOps, { session });
        if (bulkResult.matchedCount < order.items.length) {
          console.error(
            `OVERSOLD: order ${order._id.toString()} — ${order.items.length - bulkResult.matchedCount} ` +
              `item(s) could not be decremented (insufficient stock or missing product). ` +
              `Needs manual reconciliation.`
          );
        }
      }

      // Cleared here, not at checkout initiation — consistent with "only the webhook handler
      // owns post-payment state changes." If checkout cleared the cart immediately, a failed
      // payment would leave the user with an empty cart and no easy way to retry.
      await Cart.updateOne({ userId }, { $set: { items: [] } }, { session });
    });

  } catch (err) {
       // Rare race: two redeliveries of the same event both passed the pre-check before
    // either committed. Only one wins the unique index inside its transaction; the other
    // gets a duplicate-key error, which MongoDB automatically rolls back cleanly (no
    // partial writes, since it's transactional). Treat that as an idempotent no-op, not a
    // real failure — the other execution already committed the real work.
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
 
 