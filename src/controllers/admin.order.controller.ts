import * as adminOrderService from '../services/admin.order.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { AdminListOrdersQuery } from '../validations/order.validation.js';

export const listAllOrders = asyncHandler(async (req, res) => {
  const query = req.query as unknown as AdminListOrdersQuery;
  const result = await adminOrderService.listAllOrders(query);
  res.status(200).json({
    success: true,
    data: result.items,
    meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

export const getAnyOrder = asyncHandler(async (req, res) => {
  const order = await adminOrderService.getAnyOrder(req.params.id);
  res.status(200).json({ success: true, data: order });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await adminOrderService.updateOrderStatus(req.params.id, req.body.status);
  res.status(200).json({ success: true, data: order });
});

export const refundOrder = asyncHandler(async (req, res) => {
  const result = await adminOrderService.initiateRefund(req.params.id);
  // 202 Accepted, not 200 — the refund has been INITIATED with Stripe, but Order.status
  // won't actually flip to 'refunded' until the charge.refunded webhook lands. Same async
  // pattern as checkout itself.
  res.status(202).json({ success: true, message: 'Refund initiated', data: result });
});