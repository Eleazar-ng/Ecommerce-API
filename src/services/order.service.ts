import { Order, Transaction } from '../models/index.js';
import { NotFoundError } from '../utils/appError.js';

export async function listOrders(userId: string) {
  return Order.find({ userId }).sort({ createdAt: -1 });
}

export async function getOrderById(userId: string, orderId: string|any) {
  // Scoped by userId in the query itself, not just fetched-then-checked — this means a
  // user requesting someone else's order id gets the same 404 as a nonexistent id, rather
  // than a 403 that would confirm the order exists but isn't theirs.
  const order = await Order.findOne({ _id: orderId, userId });
  if (!order) {
    throw new NotFoundError('Order not found');
  }
  return order;
}

export async function listTransactions(userId: string) {
  return Transaction.find({ userId }).sort({ createdAt: -1 });
}