import { authHeader, seedAdmin, startTestApp } from '../helpers/testApp.js';
import { createCategory, createProduct } from '../helpers/testData.js';
import { User } from '../../src/modules/users/user.model.js';
import { Category } from '../../src/modules/categories/category.model.js';
import { Product } from '../../src/modules/products/product.model.js';
import { Order } from '../../src/modules/orders/order.model.js';

let ctx;
let A;
beforeAll(async () => {
  ctx = await startTestApp();
  ({ token: A } = await seedAdmin(ctx.api));
}, 120000);
afterAll(async () => {
  await ctx.stop();
}, 60000);

describe('declared indexes', () => {
  it('creates the indexes the queries rely on', async () => {
    // Touch every collection so index builds complete before asserting.
    const cat = await createCategory(ctx.api, A, { name: 'Electronics' });
    await createProduct(ctx.api, A, { name: 'Phone', sku: 'PH-1', price: 100, stock: 1, category: cat._id });

    const hasIndex = (indexes, key, unique = false) =>
      indexes.some((ix) => JSON.stringify(ix.key) === JSON.stringify(key) && (!unique || ix.unique === true));

    const users = await User.collection.indexes();
    expect(hasIndex(users, { email: 1 }, true)).toBe(true);

    const cats = await Category.collection.indexes();
    expect(hasIndex(cats, { slug: 1 }, true)).toBe(true);
    expect(hasIndex(cats, { parent: 1 })).toBe(true);

    const products = await Product.collection.indexes();
    expect(hasIndex(products, { sku: 1 }, true)).toBe(true);
    expect(hasIndex(products, { status: 1, category: 1 })).toBe(true);

    const orders = await Order.collection.indexes();
    expect(hasIndex(orders, { user: 1, createdAt: -1 })).toBe(true);
  });
});

// NOTE: last in this file — it exhausts this app instance's rate budget.
describe('global rate limiting', () => {
  it('answers 429 in the API error envelope', async () => {
    let res;
    for (let i = 0; i < 110; i += 1) {
      res = await ctx.api.get('/api/v1/');
    }
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, try again later' },
    });
    expect(typeof res.body.requestId).toBe('string');
    expect(res.headers['ratelimit-limit']).toBe('100');
  }, 120000);
});
