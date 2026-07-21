import { Router } from 'express';
import { stripeWebhook } from '../controllers/webhook.controller.js';

const router = Router();

// No `protect` here — Stripe is calling this, not a logged-in user. Authenticity is
// established entirely by signature verification inside stripeWebhook (constructStripeEvent),
// not by a JWT.
router.post('/stripe', stripeWebhook);

export default router;