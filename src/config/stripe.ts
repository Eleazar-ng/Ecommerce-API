import Stripe from 'stripe';
import { env } from './env.js';

// apiVersion deliberately omitted — letting the SDK use the version pinned to your Stripe
// account by default avoids a mismatch between a hardcoded literal here and what the
// installed `stripe` package actually expects.
export const stripe = new Stripe(env.STRIPE_SECRET_KEY);