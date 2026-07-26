import Stripe from 'stripe';
import { Order } from '../models/index.js';
import type { OrderStatus, OrderDocument } from '../models/index.js';
import { NotFoundError, ConflictError } from '../utils/appError.js';
import { stripe } from '../config/stripe.js';

interface ListAllOrdersParams {
  status?: OrderStatus;
  page: number;
  limit: number;
}

interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function listAllOrders(params: ListAllOrdersParams | any): Promise<PaginatedResult<OrderDocument>> {
  const { status, page, limit } = params;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);

  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getAnyOrder(id: string|any) {
  const order = await Order.findById(id);
  if (!order) {
    throw new NotFoundError('Order not found');
  }
  return order;
}

// Valid manual fulfillment transitions an admin can make. Deliberately narrow: an admin can
// only move a PAID order forward through physical fulfillment. They can never manually set
// 'paid'/'failed' (the Stripe webhook owns those) or 'refunded' (the refund flow's webhook
// handler owns that) — this preserves the single-writer rule from Stage 6 while carving out
// a legitimate manual exception for fulfillment status, which Stripe itself has no opinion on.
const ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ['shipped'],
  shipped: ['delivered'],
};

export async function updateOrderStatus(id: string|any, nextStatus: 'shipped' | 'delivered') {
  const order = await Order.findById(id);
  if (!order) {
    throw new NotFoundError('Order not found');
  }

  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new ConflictError(
      `Cannot move an order from "${order.status}" to "${nextStatus}". ` +
        `Valid manual transitions: paid → shipped → delivered.`
    );
  }

  order.status = nextStatus;
  await order.save();
  return order;
}

// Initiates a Stripe refund. Deliberately does NOT flip Order.status itself — that stays
// the webhook's job (see handleChargeRefunded in webhook.service.ts), preserving "only the
// webhook writes Order.status" from Stage 6. This just kicks off the refund with Stripe and
// returns its immediate response; the order's status updates asynchronously once the
// charge.refunded webhook lands — same async pattern as checkout itself.
export async function initiateRefund(id: string | any) {
  const order = await Order.findById(id);
  if (!order) {
    throw new NotFoundError('Order not found');
  }

  if (!['paid', 'shipped', 'delivered'].includes(order.status)) {
    throw new ConflictError(`Cannot refund an order with status "${order.status}"`);
  }
  if (!order.stripePaymentIntentId) {
    throw new ConflictError('This order has no associated payment to refund');
  }

  try {
    const refund = await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
    });
    return { refundId: refund.id, status: refund.status };
  } catch (err) {
    // Most likely cause: this PaymentIntent was already fully refunded, or is otherwise
    // not in a refundable state — Stripe's own validation catches what our status check
    // above doesn't (e.g. a PARTIAL refund already issued once, tracked at the Transaction
    // level rather than on Order itself).
    if (err instanceof Stripe.errors.StripeInvalidRequestError) {
      throw new ConflictError(`Stripe could not process this refund: ${err.message}`);
    }
    throw err;
  }
}