import * as dashboardService from '../services/dashboard.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { DashboardQuery } from '../validations/dashboard.validation.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const query = req.query as unknown as DashboardQuery;
  const summary = await dashboardService.getDashboardSummary(query.lowStockThreshold);
  res.status(200).json({ success: true, data: summary });
});