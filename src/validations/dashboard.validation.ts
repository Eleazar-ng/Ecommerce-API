import { z } from 'zod';

export const dashboardQuerySchema = z.object({
  query: z.object({
    lowStockThreshold: z.coerce.number().int().min(0).default(5),
  }),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>['query'];