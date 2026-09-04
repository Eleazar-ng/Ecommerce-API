import * as checkoutService from '../services/checkout.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const checkout = asyncHandler(async (req, res) => {
  const result = await checkoutService.createCheckout(req.user, req.body.shippingAddress);
  res.status(201).json({ success: true, data: result });
});