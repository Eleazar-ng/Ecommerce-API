import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { constructStripeEvent, handleStripeEvent } from '../services/webhook.service.js';
import { BadRequestError } from '../utils/appError.js';

export const stripeWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'];
  if (!signature || Array.isArray(signature)) {
    throw new BadRequestError('Missing Stripe signature header');
  }

  // req.body is a raw Buffer here, NOT parsed JSON — see app.ts. This route is mounted with
  // express.raw() specifically so the signature can be verified against the exact bytes
  // Stripe sent; a parsed-then-restringified body would not match the signature.
  const event = constructStripeEvent(req.body as Buffer, signature);
  await handleStripeEvent(event);

  // Always 200 once processed (or acknowledged-but-ignored for an unhandled event type) so
  // Stripe doesn't keep retrying. Only signature failures (handled inside
  // constructStripeEvent, above) reject with 400.
  res.status(200).json({ received: true });
});