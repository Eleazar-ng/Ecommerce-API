import { Router } from 'express';
import authRoutes from './auth.route.js';
import adminRoutes from './admin.route.js';
import cartRoutes from "./cart.routes.js";

const router = Router();

// Simple liveness check — useful for uptime monitoring and for verifying graceful
// shutdown behavior in Stage 11 (this should stop responding once shutdown begins).
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use("/cart", cartRoutes);

// Further feature routers get mounted here as later stages build them, e.g.:
// import productRoutes from './product.routes.js';
// router.use('/products', productRoutes);

export default router;