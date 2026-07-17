// Throwaway dev utility, not part of the app's real seed data. Stage 7 will add proper
// admin-authenticated endpoints for creating products; until then, this is how you get
// real productIds to test the cart against. Idempotent — safe to run more than once,
// upserts by slug rather than creating duplicates on every run.
import { connectDB, disconnectDB } from '../config/db.js';
import { Category, Product } from '../models/index.js';

async function seedTestProducts(): Promise<void> {
  await connectDB();

  const category = await Category.findOneAndUpdate(
    { slug: 'test-gear' },
    { name: 'Test Gear', slug: 'test-gear', isActive: true },
    { upsert: true, new: true }
  );

  const products = [
    {
      name: 'Trail Running Shoes',
      slug: 'trail-running-shoes',
      description: 'Lightweight trail shoes with grippy outsoles, good for mixed terrain.',
      priceCents: 8999, // $89.99
      stock: 15,
      categoryId: category._id,
      images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
      tags: ['trail', 'running', 'outdoor'],
      isActive: true,
    },
    {
      name: 'Insulated Water Bottle',
      slug: 'insulated-water-bottle',
      description: '750ml stainless steel bottle, keeps drinks cold for 24 hours.',
      priceCents: 2499, // $24.99
      stock: 3, // deliberately low — good for testing the "exceeds stock" rejection path
      categoryId: category._id,
      images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
      tags: ['hydration', 'outdoor'],
      isActive: true,
    },
  ];

  for (const p of products) {
    const saved = await Product.findOneAndUpdate({ slug: p.slug }, p, {
      upsert: true,
      new: true,
    });
    console.log(`Product ready: ${saved.name}  |  _id: ${saved._id}  |  stock: ${saved.stock}`);
  }

  console.log('\nUse these _id values as productId when testing POST /api/v1/cart/items');
  await disconnectDB();
  process.exit(0);
}

seedTestProducts().catch((err) => {
  console.error('Seeder failed:', err);
  process.exit(1);
});