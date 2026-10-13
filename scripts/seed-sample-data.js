/**
 * Seed sample data into ALL collections via the real services
 * (password hashing, slugs, SKU normalization, stock decrements and
 * server-side totals all behave exactly like the API).
 *
 * Usage:
 *   node scripts/seed-sample-data.js           # seed an empty database
 *   node scripts/seed-sample-data.js --fresh   # wipe users/categories/products/orders first
 *
 * Connection comes from .env (MONGODB_URI) — same DB the API uses.
 * Sample credentials are printed at the end. Change or remove them
 * before any real use.
 */
import { validateEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Category } from '../src/modules/categories/category.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { register } from '../src/modules/auth/auth.service.js';
import { createCategory } from '../src/modules/categories/category.service.js';
import { createProduct } from '../src/modules/products/product.service.js';
import { createOrder, setOrderStatus } from '../src/modules/orders/order.service.js';
import { logger } from '../src/logger/logger.js';

const FRESH = process.argv.includes('--fresh');

async function main() {
  validateEnv();
  await connectDatabase();
  try {
    if (FRESH) {
      await Promise.all([
        Order.deleteMany({}),
        Product.deleteMany({}),
        Category.deleteMany({}),
        User.deleteMany({}),
      ]);
      logger.info('Existing users/categories/products/orders wiped (--fresh)');
    } else {
      const [u, c, p, o] = await Promise.all([
        User.countDocuments(),
        Category.countDocuments(),
        Product.countDocuments(),
        Order.countDocuments(),
      ]);
      if (u + c + p + o > 0) {
        console.error(
          `Database is not empty (users=${u} categories=${c} products=${p} orders=${o}). Re-run with --fresh to wipe and reseed.`,
        );
        process.exitCode = 1;
        return;
      }
    }

    // ---- users ----
    await register({ name: 'Site Admin', email: 'admin@example.com', password: 'Admin1234!' });
    await User.updateOne({ email: 'admin@example.com' }, { role: 'admin' });
    const customers = [
      { name: 'Asha', email: 'asha@example.com', password: 'Customer123' },
      { name: 'Ravi', email: 'ravi@example.com', password: 'Customer123' },
      { name: 'Priya', email: 'priya@example.com', password: 'Customer123' },
    ];
    for (const c of customers) await register(c);
    const ids = Object.fromEntries(
      await Promise.all(
        ['asha@example.com', 'ravi@example.com', 'priya@example.com'].map(async (email) => {
          const u = await User.findOne({ email }).select('_id');
          return [email, u._id.toString()];
        }),
      ),
    );

    // ---- categories (hierarchy + one inactive branch) ----
    const electronics = await createCategory({ name: 'Electronics' });
    const mobiles = await createCategory({ name: 'Mobiles', parent: electronics._id });
    const smartphones = await createCategory({ name: 'Smartphones', parent: mobiles._id });
    const laptops = await createCategory({ name: 'Laptops', parent: electronics._id });
    const fashion = await createCategory({ name: 'Fashion' });
    const men = await createCategory({ name: 'Men', parent: fashion._id });
    const women = await createCategory({ name: 'Women', parent: fashion._id });
    const books = await createCategory({ name: 'Books' });
    await createCategory({ name: 'Legacy', isActive: false });

    const bySlug = Object.fromEntries(
      (await Category.find().select('_id slug')).map((c) => [c.slug, c._id.toString()]),
    );

    // ---- products ----
    const products = [
      { name: 'Pixel 8 Pro', sku: 'PH-PIXEL', price: 899, salePrice: 799, stock: 25, category: bySlug.smartphones },
      { name: 'Galaxy S24', sku: 'PH-GALAXY', price: 799, stock: 30, category: bySlug.smartphones },
      { name: 'Nokia 3310 Classic', sku: 'PH-NOKIA', price: 59, stock: 100, category: bySlug.mobiles },
      { name: 'MacBook Pro 14', sku: 'LP-MAC', price: 1999, salePrice: 1799, stock: 10, category: bySlug.laptops },
      { name: 'Dell XPS 13', sku: 'LP-DELL', price: 1299, stock: 15, category: bySlug.laptops },
      { name: 'Cotton T-Shirt', sku: 'FSH-TSHIRT', price: 25, salePrice: 19, stock: 200, category: bySlug.men },
      { name: 'Summer Dress', sku: 'FSH-DRESS', price: 49, stock: 150, category: bySlug.women },
      { name: 'Clean Code', sku: 'BK-CLEAN', price: 45, salePrice: 39, stock: 50, category: bySlug.books },
      { name: 'The Pragmatic Programmer', sku: 'BK-PRAG', price: 50, stock: 40, category: bySlug.books },
      { name: 'Vintage Radio', sku: 'OLD-RADIO', price: 120, stock: 5, category: bySlug.legacy },
      { name: 'Unreleased Tablet', sku: 'DRAFT-TAB', price: 499, stock: 8, category: bySlug.electronics, status: 'inactive' },
    ];
    const productIds = {};
    for (const p of products) {
      const created = await createProduct(p);
      productIds[created.sku] = created._id.toString();
    }

    // ---- orders (stock decremented + totals computed by the service) ----
    const o1 = await createOrder(ids['asha@example.com'], [
      { product: productIds['PH-PIXEL'], quantity: 2 },
      { product: productIds['BK-CLEAN'], quantity: 1 },
    ]);
    await setOrderStatus(o1._id, 'confirmed');

    await createOrder(ids['ravi@example.com'], [
      { product: productIds['FSH-TSHIRT'], quantity: 1 },
      { product: productIds['FSH-DRESS'], quantity: 1 },
    ]);

    const o3 = await createOrder(ids['priya@example.com'], [{ product: productIds['PH-GALAXY'], quantity: 1 }]);
    await setOrderStatus(o3._id, 'cancelled');

    const counts = {
      users: await User.countDocuments(),
      categories: await Category.countDocuments(),
      products: await Product.countDocuments(),
      orders: await Order.countDocuments(),
    };
    console.log('Seeded:', JSON.stringify(counts));
    console.log('Sample logins — admin@example.com / Admin1234! (admin)');
    console.log('                asha@example.com / Customer123 (customer)');
    console.log('Change or remove these credentials before any real use.');
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
