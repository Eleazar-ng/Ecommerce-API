import { Product, Order } from '../models/index.js';
import type { OrderDocument } from '../models/index.js';

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

interface DashboardSummary {
  totalActiveProducts: number;
  lowStockCount: number;
  lowStockThreshold: number;
  totalOrders: number;
  totalRevenueCents: number;
  recentOrders: OrderDocument[];
}

export async function getDashboardSummary(
  lowStockThreshold: number = DEFAULT_LOW_STOCK_THRESHOLD
): Promise<DashboardSummary> {
  const [totalActiveProducts, lowStockCount, totalOrders, revenueAgg, recentOrders] = await Promise.all([
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({ isActive: true, stock: { $lte: lowStockThreshold } }),
    Order.countDocuments({}),
    // Revenue = orders that were actually paid and not refunded. This is a deliberate
    // simplification: it excludes a refunded order's ENTIRE totalCents from revenue, since
    // partial refunds are only tracked at the Transaction level, not reflected back onto
    // Order itself. Fine for a dashboard overview; not precise enough for real accounting.
    Order.aggregate([
      { $match: { status: { $in: ['paid', 'shipped', 'delivered'] } } },
      { $group: { _id: null, total: { $sum: '$totalCents' } } },
    ]),
    Order.find().sort({ createdAt: -1 }).limit(5),
  ]);

  return {
    totalActiveProducts,
    lowStockCount,
    lowStockThreshold,
    totalOrders,
    totalRevenueCents: revenueAgg[0]?.total ?? 0,
    recentOrders,
  };
}