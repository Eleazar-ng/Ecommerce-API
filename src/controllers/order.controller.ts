import * as orderService from '../services/order.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listOrders = asyncHandler(async (req, res) => {
  const orders = await orderService.listOrders(req.user._id.toString());
  res.status(200).json({ success: true, data: orders });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.user._id.toString(), req.params.id);
  res.status(200).json({ success: true, data: order });
});

export const listTransactions = asyncHandler(async (req, res) => {
  const transactions = await orderService.listTransactions(req.user._id.toString());
  res.status(200).json({ success: true, data: transactions });
});