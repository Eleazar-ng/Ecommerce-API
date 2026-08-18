import { Transaction } from '../models/index.js';
import type { TransactionType, TransactionStatus, TransactionDocument } from '../models/index.js';
import { NotFoundError } from '../utils/appError.js';

interface ListAllTransactionsParams {
  status?: TransactionStatus;
  type?: TransactionType;
  userId?: string;
  orderId?: string;
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

// Admin-scoped: no userId restriction by default (unlike order.service.ts's
// listTransactions, which is always scoped to req.user). userId/orderId here are optional
// FILTERS an admin can apply, not a mandatory ownership boundary — this is deliberately
// the "see everything" view, gated by the view_transactions permission at the route level
// rather than by query scoping.
export async function listAllTransactions(
  params: ListAllTransactionsParams | any
): Promise<PaginatedResult<TransactionDocument>> {
  const { status, type, userId, orderId, page, limit } = params;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (userId) filter.userId = userId;
  if (orderId) filter.orderId = orderId;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Transaction.countDocuments(filter),
  ]);

  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getAnyTransaction(id: string | any) {
  const transaction = await Transaction.findById(id);
  if (!transaction) {
    throw new NotFoundError('Transaction not found');
  }
  return transaction;
}