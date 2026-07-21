import { z } from 'zod';

// Deliberately the ONLY thing the client sends for checkout. Pricing, item list, and total
// are always computed server-side from the live cart + product data — never trust a
// client-sent amount or item list for anything involving money.
export const checkoutSchema = z.object({
  body: z.object({
    shippingAddress: z.object({
      line1: z.string().min(1),
      city: z.string().min(1),
      state: z.string().optional(),
      postalCode: z.string().min(1),
      country: z.string().min(2, 'Use a 2-letter country code, e.g. US'),
    }),
  }),
});