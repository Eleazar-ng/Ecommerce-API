import { Router } from 'express';
import authRoutes from './auth.route.js';
import adminRoutes from './admin.route.js';
import cartRoutes from "./cart.routes.js";
import checkoutRoutes from './checkout.route.js';
import orderRoutes from './order.route.js';
import meRoutes from './me.route.js';
import categoryRoutes from './category.route.js';
import productRoutes from './product.route.js';
import dashboardRoutes from './dashboard.route.js';
import transactionRoutes from "./transaction.route.js";

const router = Router();

// Simple liveness check — useful for uptime monitoring and for verifying graceful
// shutdown behavior in Stage 11 (this should stop responding once shutdown begins).
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use("/cart", cartRoutes);
router.use('/checkout', checkoutRoutes);
router.use('/orders', orderRoutes);
router.use('/me', meRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/transactions', transactionRoutes);

// Further feature routers get mounted here as later stages build them, e.g.:
// import productRoutes from './product.routes.js';
// router.use('/products', productRoutes);

export default router;