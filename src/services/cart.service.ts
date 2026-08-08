import { Cart, Product } from '../models/index.js';
import type { IProduct } from '../models/index.js';
import { NotFoundError, ConflictError } from '../utils/appError.js';
import type { Types } from 'mongoose';

// --- Design decisions locked in for this stage (see docs/deferred-decisions.md) ---
// 1. STOCK CHECK IS SOFT HERE: add/update reject if the requested quantity exceeds current
//    stock, but nothing is RESERVED — no decrement happens, no hold is placed. Two users can
//    both have the last unit "successfully" in their carts. The HARD check happens at
//    checkout (Stage 6), which re-validates against live stock immediately before payment.
//    This is deliberate (matches how Shopify/Amazon carts work), not an oversight — a
//    reservation system would need a TTL/cleanup job for abandoned carts, which is more
//    machinery than this stage needs.
// 2. Exceeding stock REJECTS the request outright (409) rather than silently capping the
//    quantity to whatever's available — silent capping surprises users.
// 3. Unavailable items (deactivated product, or stock has dropped below cart quantity since
//    it was added) stay in the cart and are flagged `available: false`, not silently removed.

interface CartItemView {
  productId: string;
  name: string;
  priceCents: number;
  image: string | null;
  quantity: number;
  stock: number;
  available: boolean;
  lineTotalCents: number;
}

interface CartView {
  items: CartItemView[];
  itemCount: number;
  subtotalCents: number;
}

// Cart.items.productId is a live reference (see Cart.ts) — populate() pulls in current
// product data on every read, which is exactly why cart items don't snapshot price/name.
// .lean() applied — this function only reads the populated data to build a transformed
// CartView; it never calls .save() on the cart or any populated product.
async function toCartView(userId: Types.ObjectId | string): Promise<CartView> {
  const cart = await Cart.findOne({ userId }).populate<{
    items: { productId: IProduct & { _id: Types.ObjectId }; quantity: number }[];
  }>({
    path: 'items.productId',
    select: 'name priceCents images stock isActive',
  }).lean();

  const items: CartItemView[] = (cart?.items ?? []).map((item:any) => {
    const product = item.productId; // populated document, or could be null if hard-deleted
    const exists = !!product;
    const active = exists && product.isActive;
    const inStock = exists && product.stock >= item.quantity;
    const available = exists && active && inStock;

    return {
      productId: exists ? product._id.toString() : String(item.productId),
      name: exists ? product.name : 'Product no longer available',
      priceCents: exists ? product.priceCents : 0,
      image: exists ? (product.images[0]?.url ?? null) : null,
      quantity: item.quantity,
      stock: exists ? product.stock : 0,
      available,
      lineTotalCents: available ? product.priceCents * item.quantity : 0,
    };
  });

  // Unavailable items are shown (per decision #3 above) but deliberately excluded from the
  // payable total and count — a subtotal that includes something the user can't actually
  // check out with would be misleading.
  const subtotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
  const itemCount = items.filter((i) => i.available).reduce((sum, i) => sum + i.quantity, 0);

  return { items, subtotalCents, itemCount };
}

export async function getCart(userId: string): Promise<CartView> {
  // Auto-create an empty cart on first view — every logged-in user is assumed to have
  // exactly one cart (enforced by the unique index on Cart.userId from Stage 2).
  await Cart.findOneAndUpdate({ userId }, { $setOnInsert: { userId, items: [] } }, { upsert: true });
  return toCartView(userId);
}

export async function addItem(userId: string, productId: string, quantity: number): Promise<CartView> {
  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw new NotFoundError('Product not found');
  }

  const existingCart = await Cart.findOne({ userId, 'items.productId': productId });
  const currentQty = existingCart?.items.find((i:any) => i.productId.toString() === productId)?.quantity ?? 0;
  const requestedTotal = currentQty + quantity;

  if (requestedTotal > product.stock) {
    throw new ConflictError(
      `Only ${product.stock} unit(s) of "${product.name}" available` +
        (currentQty > 0 ? ` (you already have ${currentQty} in your cart)` : '')
    );
  }

  if (existingCart) {
    // Atomic increment on the matched array element — avoids a fetch-mutate-save race if
    // the same user fires two add-to-cart requests close together (e.g. a double-click).
    await Cart.updateOne(
      { userId, 'items.productId': productId },
      { $inc: { 'items.$.quantity': quantity } }
    );
  } else {
    // upsert: true here is belt-and-suspenders with the findOneAndUpdate in getCart() —
    // handles the case where addItem is called before the cart has ever been viewed.
    await Cart.updateOne(
      { userId },
      { $push: { items: { productId, quantity } } },
      { upsert: true }
    );
  }

  return toCartView(userId);
}

export async function updateItemQuantity(
  userId: string,
  productId: string | any,
  quantity: number
): Promise<CartView> {
  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw new NotFoundError('Product not found');
  }

  if (quantity > product.stock) {
    throw new ConflictError(`Only ${product.stock} unit(s) of "${product.name}" available`);
  }

  const result = await Cart.updateOne(
    { userId, 'items.productId': productId },
    { $set: { 'items.$.quantity': quantity } }
  );

  if (result.matchedCount === 0) {
    throw new NotFoundError('This item is not in your cart');
  }

  return toCartView(userId);
}

// Deliberately idempotent — removing an item that's already gone from the cart is still a
// "success" from the caller's point of view (the end state they wanted is achieved), not
// a 404. This matches standard DELETE semantics.
export async function removeItem(userId: string, productId: string | any): Promise<CartView> {
  await Cart.updateOne({ userId }, { $pull: { items: { productId } } });
  return toCartView(userId);
}

export async function clearCart(userId: string): Promise<CartView> {
  await Cart.updateOne({ userId }, { $set: { items: [] } }, { upsert: true });
  return toCartView(userId);
}