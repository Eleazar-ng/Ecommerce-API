import { Cart, Product, Order } from '../models/index.js';
import type { IShippingAddress, IOrderItem,ICartItem, UserDocument } from '../models/index.js';
import { BadRequestError, ForbiddenError, ConflictError } from '../utils/appError.js';
import { stripe } from '../config/stripe.js';

interface CheckoutResult {
  orderId: string;
  clientSecret: string;
  amountCents: number;
}

// PaymentIntent statuses that mean "still open, a customer could complete or retry payment
// on this exact PaymentIntent" — as opposed to 'succeeded' (done, don't touch) or 'canceled'
// (dead, needs a fresh one).
const OPEN_INTENT_STATUSES = ['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'];

// True only if the cart contains exactly the same products at exactly the same quantities
// as what's already snapshotted on the pending order — anything else (item added/removed,
// quantity changed) means the order no longer reflects what the customer is trying to buy.
function cartMatchesOrderItems(cartItems: ICartItem[], orderItems: IOrderItem[]): boolean {
  if (cartItems.length !== orderItems.length) return false;
  const orderQuantities = new Map(orderItems.map((i) => [i.productId.toString(), i.quantity]));
  return cartItems.every((ci) => orderQuantities.get(ci.productId.toString()) === ci.quantity);
}

// Takes the full user document (not just an id) because `protect` middleware already
// fetched it — re-querying User here would just be a redundant DB round-trip for data
// we already have, including the isEmailVerified flag this function needs anyway.
export async function createCheckout(
  user: UserDocument,
  shippingAddress: IShippingAddress
): Promise<CheckoutResult> {
  // Gate flagged back in Stage 0 / docs/deferred-decisions.md: order confirmations and
  // receipts go to this address, so an unverified email risks silently bouncing them.
  if (!user.isEmailVerified) {
    throw new ForbiddenError('Please verify your email before checking out');
  }

  const cart = await Cart.findOne({ userId: user._id });
  if (!cart || cart.items.length === 0) {
    throw new BadRequestError('Your cart is empty');
  }

  // --- Idempotency guard: reuse or supersede an already-pending order for this user ---
  // Without this, calling checkout twice in a row (double-click, frontend retry, network
  // hiccup) creates two separate Orders + PaymentIntents for the same cart. If both happen
  // to succeed, the customer is charged twice and stock decrements twice for units that only
  // existed once. This check makes checkout safe to call more than once for the same intent.
    const existingPending = await Order.findOne({ userId: user._id, status: 'pending' }).sort({
    createdAt: -1,
  });
 
  if (existingPending?.stripePaymentIntentId) {
    const existingIntent = await stripe.paymentIntents.retrieve(existingPending.stripePaymentIntentId);
 
    if (existingIntent.status === 'succeeded') {
      // The PaymentIntent already succeeded but our Order.status is still 'pending' — the
      // webhook for it just hasn't landed yet (a real, if narrow, race). Do NOT create a
      // second order/charge; the existing payment is already in the process of being
      // fulfilled. The webhook will flip this order to 'paid' momentarily.
      throw new ConflictError(
        'A payment for a previous checkout was already completed and is being processed. Check your order history shortly.'
      );
    }
 
    const stillOpen = OPEN_INTENT_STATUSES.includes(existingIntent.status);
 
    if (stillOpen && cartMatchesOrderItems(cart.items, existingPending.items)) {
      // Same cart, same still-open PaymentIntent — hand back the SAME order and clientSecret
      // instead of creating a duplicate. This is what actually fixes the double-click case:
      // the second call becomes a no-op that just returns the session already in flight.
      if (!existingIntent.client_secret) {
        throw new Error('Stripe did not return a client secret for the existing PaymentIntent');
      }
      return {
        orderId: existingPending._id.toString(),
        clientSecret: existingIntent.client_secret,
        amountCents: existingPending.totalCents,
      };
    }
 
    // Either the cart changed since this pending order was snapshotted, or the PaymentIntent
    // is in a dead-end state. Either way, this pending order is stale — supersede it rather
    // than leaving two pending orders/PaymentIntents alive for the same user.
    if (stillOpen) {
      try {
        await stripe.paymentIntents.cancel(existingPending.stripePaymentIntentId);
      } catch (err) {
        // Don't let a cleanup failure block a legitimate new checkout attempt — worst case,
        // Stripe auto-expires the stale, uncancelled PaymentIntent on its own after 24h with
        // no side effects, since it was never confirmed.
        console.error(`Failed to cancel stale PaymentIntent ${existingPending.stripePaymentIntentId}:`, err);
      }
    }
    existingPending.status = 'cancelled';
    await existingPending.save();
  }

  // --- HARD stock re-validation ---
  // Stage 5's add-to-cart check was deliberately soft (Option C — see cart.service.ts).
  // This is the hard check: re-fetch live product data right now and fail the ENTIRE
  // checkout if anything has changed since items were added — stock dropped, price
  // changed (irrelevant to the check but we use the live price anyway below), or the
  // product was deactivated.
  const productIds = cart.items.map((item) => item.productId);
  const products = await Product.find({ _id: { $in: productIds } });
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  const orderItems: IOrderItem[] = [];
  let totalCents = 0;

  for (const cartItem of cart.items) {
    const product = productMap.get(cartItem.productId.toString());

    if (!product || !product.isActive) {
      throw new ConflictError(
        'A product in your cart is no longer available. Please review your cart.'
      );
    }
    if (product.stock < cartItem.quantity) {
      throw new ConflictError(
        `Only ${product.stock} unit(s) of "${product.name}" available. Please update your cart.`
      );
    }

    // Price and name are read from the live Product document, NEVER from the client or
    // from anything cached — this is what "server-side-only pricing" actually means in
    // code, not just a principle stated in a comment.
    orderItems.push({
      productId: product._id,
      name: product.name,
      priceCents: product.priceCents,
      quantity: cartItem.quantity,
    });
    totalCents += product.priceCents * cartItem.quantity;
  }

  // Order created BEFORE the PaymentIntent, status 'pending' — see
  // docs/deferred-decisions.md. This is what lets orderId be embedded in PaymentIntent
  // metadata below, so the webhook handler always has a real order to attach to.
  const order = await Order.create({
    userId: user._id,
    items: orderItems,
    totalCents,
    status: 'pending',
    shippingAddress,
  });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: totalCents,
    currency: 'usd',
    metadata: {
      orderId: order._id.toString(),
      userId: user._id.toString(),
    },
    automatic_payment_methods: { enabled: true },
  });

  order.stripePaymentIntentId = paymentIntent.id;
  await order.save();

  if (!paymentIntent.client_secret) {
    // Genuinely unexpected — Stripe not returning a client_secret on a freshly created
    // PaymentIntent indicates something wrong with the Stripe account/API config itself,
    // not a user error. Let it fall through to the generic 500 handler.
    throw new Error('Stripe did not return a client secret for this PaymentIntent');
  }

  return {
    orderId: order._id.toString(),
    clientSecret: paymentIntent.client_secret,
    amountCents: totalCents,
  };
}