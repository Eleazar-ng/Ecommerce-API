import * as cartService from '../services/cart.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getCart = asyncHandler(async (req, res) => {
  const cart = await cartService.getCart(req.user._id.toString());
  res.status(200).json({ success: true, data: cart });
});

export const addItem = asyncHandler(async (req, res) => {
  const cart = await cartService.addItem(req.user._id.toString(), req.body.productId, req.body.quantity);
  res.status(200).json({ success: true, data: cart });
});

export const updateItem = asyncHandler(async (req, res) => {
  const cart = await cartService.updateItemQuantity(
    req.user._id.toString(),
    req.params.productId,
    req.body.quantity
  );
  res.status(200).json({ success: true, data: cart });
});

export const removeItem = asyncHandler(async (req, res) => {
  const cart = await cartService.removeItem(req.user._id.toString(), req.params.productId);
  res.status(200).json({ success: true, data: cart });
});

export const clearCart = asyncHandler(async (req, res) => {
  const cart = await cartService.clearCart(req.user._id.toString());
  res.status(200).json({ success: true, data: cart });
});