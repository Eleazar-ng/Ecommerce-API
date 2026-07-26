import * as adminTransactionService from '../services/admin.transaction.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { AdminListTransactionsQuery } from '../validations/transaction.validation.js';

export const listAllTransactions = asyncHandler(async (req, res) => {
  const query = req.query as unknown as AdminListTransactionsQuery;
  const result = await adminTransactionService.listAllTransactions(query);
  res.status(200).json({
    success: true,
    data: result.items,
    meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

export const getAnyTransaction = asyncHandler(async (req, res) => {
  const transaction = await adminTransactionService.getAnyTransaction(req.params.id);
  res.status(200).json({ success: true, data: transaction });
});