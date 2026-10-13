import mongoose from 'mongoose';
import { authHeader, registerUser, seedAdmin, startTestApp } from '../helpers/testApp.js';
import { createCategory, createOrder, createProduct } from '../helpers/testData.js';
import { Product } from '../../src/modules/products/product.model.js';
import { Order } from '../../src/modules/orders/order.model.js';

let ctx;
let A;
let TA;
let TB;
let E;
let M;
let L;
let p1;
let p2;
let pOff;
let pLegacy;
let pLow;

const stockOf = async (id) => (await Product.findById(id).select('stock')).stock;

beforeAll(async () => {
  ctx = await startTestApp();
  ({ token: A } = await seedAdmin(ctx.api));
  ({ token: TA } = await registerUser(ctx.api, { name: 'Cust A', email: 'a@example.com', password: 'Secret123' }));
  ({ token: TB } = await registerUser(ctx.api, { name: 'Cust B', email: 'b@example.com', password: 'Secret123' }));
  E = (await createCategory(ctx.api, A, { name: 'Electronics' }))._id;
  M = (await createCategory(ctx.api, A, { name: 'Mobiles', parent: E }))._id;
  L = (await createCategory(ctx.api, A, { name: 'Legacy', parent: null, isActive: false }))._id;
  p1 = await createProduct(ctx.api, A, { name: 'Phone', sku: 'PH-1', price: 100, stock: 10, category: M });
  p2 = await createProduct(ctx.api, A, { name: 'Tablet', sku: 'TB-2', price: 120, salePrice: 70, stock: 5, category: M });
  pOff = await createProduct(ctx.api, A, { name: 'Draft', sku: 'DR-3', price: 50, stock: 5, category: E, status: 'inactive' });
  pLegacy = await createProduct(ctx.api, A, { name: 'Old Radio', sku: 'OR-4', price: 50, stock: 5, category: L });
  pLow = await createProduct(ctx.api, A, { name: 'Rare Item', sku: 'RR-5', price: 25, stock: 1, category: E });
}, 120000);
afterAll(async () => {
  await ctx.stop();
}, 60000);

describe('POST /api/v1/orders', () => {
  it('creates multi-item orders with server-computed totals and snapshots', async () => {
    const order = await createOrder(ctx.api, TA, [
      { product: p1._id, quantity: 2 },
      { product: p2._id, quantity: 1 },
    ]);
    expect(order).toMatchObject({ total: 270, subtotal: 270, status: 'pending' });
    expect(order.items).toHaveLength(2);
    expect(order.items.find((i) => i.sku === 'TB-2').unitPrice).toBe(70);
    expect(await stockOf(p1._id)).toBe(8);
    expect(await stockOf(p2._id)).toBe(4);
  });

  it('ignores client-sent totals and statuses', async () => {
    const res = await ctx.api.post('/api/v1/orders').set(authHeader(TA)).send({ items: [{ product: p1._id, quantity: 1 }], total: 1, status: 'delivered' });
    expect(res.body.data.order).toMatchObject({ total: 100, status: 'pending' });
  });

  it('400s duplicates, empty items, bad quantities, and caps', async () => {
    const dup = await ctx.api.post('/api/v1/orders').set(authHeader(TA)).send({ items: [{ product: p1._id, quantity: 1 }, { product: p1._id, quantity: 1 }] });
    const empty = await ctx.api.post('/api/v1/orders').set(authHeader(TA)).send({ items: [] });
    const zero = await ctx.api.post('/api/v1/orders').set(authHeader(TA)).send({ items: [{ product: p1._id, quantity: 0 }] });
    const tooMany = await ctx.api.post('/api/v1/orders').set(authHeader(TA)).send({ items: Array.from({ length: 21 }, () => ({ product: p1._id, quantity: 1 })) });
    const huge = await ctx.api.post('/api/v1/orders').set(authHeader(TA)).send({ items: [{ product: p1._id, quantity: 51 }] });
    for (const res of [dup, empty, zero, tooMany, huge]) expect(res.status).toBe(400);
  });

  it('404s missing products; 409s unavailable ones and short stock', async () => {
    const miss = await ctx.api.post('/api/v1/orders').set(authHeader(TA)).send({ items: [{ product: new mongoose.Types.ObjectId(), quantity: 1 }] });
    const inact = await ctx.api.post('/api/v1/orders').set(authHeader(TA)).send({ items: [{ product: pOff._id, quantity: 1 }] });
    const leg = await ctx.api.post('/api/v1/orders').set(authHeader(TA)).send({ items: [{ product: pLegacy._id, quantity: 1 }] });
    const over = await ctx.api.post('/api/v1/orders').set(authHeader(TA)).send({ items: [{ product: pLow._id, quantity: 2 }] });
    expect(miss.status).toBe(404);
    for (const res of [inact, leg, over]) expect(res.status).toBe(409);
    expect(await stockOf(pLow._id)).toBe(1);
  });

  it('rolls back failed multi-item orders with no partial writes', async () => {
    const before = await stockOf(p1._id);
    const ordersBefore = await Order.countDocuments();
    const res = await ctx.api.post('/api/v1/orders').set(authHeader(TA)).send({ items: [{ product: p1._id, quantity: 1 }, { product: pLow._id, quantity: 5 }] });
    expect(res.status).toBe(409);
    expect(await stockOf(p1._id)).toBe(before);
    expect(await Order.countDocuments()).toBe(ordersBefore);
  });

  it('keeps price snapshots when products change later', async () => {
    const order = await createOrder(ctx.api, TA, [{ product: p1._id, quantity: 1 }]);
    await ctx.api.patch(`/api/v1/admin/products/${p1._id}`).set(authHeader(A)).send({ price: 150 });
    const reread = await ctx.api.get(`/api/v1/orders/${order._id}`).set(authHeader(TA));
    expect(reread.body.data.order.items.find((i) => i.sku === 'PH-1').unitPrice).toBe(100);
  });
});

describe('order history and ownership', () => {
  it('lists only own orders; cross-customer reads 404; anonymous 401', async () => {
    const me = await ctx.api.get('/api/v1/orders/me').set(authHeader(TA));
    expect(me.status).toBe(200);
    expect(me.body.data.total).toBeGreaterThanOrEqual(3);
    const other = await ctx.api.get('/api/v1/orders/me').set(authHeader(TB));
    expect(other.body.data.total).toBe(0);
    const orderId = me.body.data.items[0]._id;
    expect((await ctx.api.get(`/api/v1/orders/${orderId}`).set(authHeader(TB))).status).toBe(404);
    expect((await ctx.api.get(`/api/v1/orders/${orderId}`).set(authHeader(A))).status).toBe(200);
    expect((await ctx.api.get(`/api/v1/orders/${orderId}`)).status).toBe(401);
    expect((await ctx.api.get('/api/v1/orders/nope').set(authHeader(TA))).status).toBe(400);
  });

  it('never oversells under concurrent races', async () => {
    await Product.updateOne({ _id: pLow._id }, { stock: 3 });
    const [r1, r2] = await Promise.all([
      ctx.api.post('/api/v1/orders').set(authHeader(TA)).send({ items: [{ product: pLow._id, quantity: 2 }] }),
      ctx.api.post('/api/v1/orders').set(authHeader(TB)).send({ items: [{ product: pLow._id, quantity: 2 }] }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(await stockOf(pLow._id)).toBe(1);
  });
});

describe('admin order management', () => {
  it('401/403 guards and full listing with status filter', async () => {
    expect((await ctx.api.get('/api/v1/admin/orders')).status).toBe(401);
    expect((await ctx.api.get('/api/v1/admin/orders').set(authHeader(TA))).status).toBe(403);
    expect((await ctx.api.patch(`/api/v1/admin/orders/${new mongoose.Types.ObjectId()}/status`).set(authHeader(TA)).send({ status: 'confirmed' })).status).toBe(403);
    const list = await ctx.api.get('/api/v1/admin/orders').set(authHeader(A));
    expect(list.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('validates status bodies and ids (400/404)', async () => {
    const order = await createOrder(ctx.api, TA, [{ product: p2._id, quantity: 1 }]);
    expect((await ctx.api.patch(`/api/v1/admin/orders/${order._id}/status`).set(authHeader(A)).send({ status: 'flying' })).status).toBe(400);
    expect((await ctx.api.patch('/api/v1/admin/orders/nope/status').set(authHeader(A)).send({ status: 'confirmed' })).status).toBe(400);
    expect((await ctx.api.patch(`/api/v1/admin/orders/${new mongoose.Types.ObjectId()}/status`).set(authHeader(A)).send({ status: 'confirmed' })).status).toBe(404);
    expect((await ctx.api.patch(`/api/v1/admin/orders/${order._id}/status`).set(authHeader(A)).send({})).status).toBe(400);
    await ctx.api.patch(`/api/v1/admin/orders/${order._id}/status`).set(authHeader(A)).send({ status: 'cancelled' });
  });

  it('rejects illegal jumps and walks the full lifecycle', async () => {
    const order = await createOrder(ctx.api, TA, [{ product: p2._id, quantity: 1 }]);
    expect((await ctx.api.patch(`/api/v1/admin/orders/${order._id}/status`).set(authHeader(A)).send({ status: 'shipped' })).status).toBe(409);
    for (const status of ['confirmed', 'processing', 'shipped', 'delivered']) {
      const res = await ctx.api.patch(`/api/v1/admin/orders/${order._id}/status`).set(authHeader(A)).send({ status });
      expect(res.status).toBe(200);
    }
    expect((await ctx.api.patch(`/api/v1/admin/orders/${order._id}/status`).set(authHeader(A)).send({ status: 'cancelled' })).status).toBe(409);
  });

  it('restores stock exactly once on cancel, from any cancellable state', async () => {
    const o1 = await createOrder(ctx.api, TA, [{ product: p2._id, quantity: 1 }]);
    const before = await stockOf(p2._id);
    const cancel = await ctx.api.patch(`/api/v1/admin/orders/${o1._id}/status`).set(authHeader(A)).send({ status: 'cancelled' });
    expect(cancel.body.data.order.status).toBe('cancelled');
    expect(await stockOf(p2._id)).toBe(before + 1);
    expect((await ctx.api.patch(`/api/v1/admin/orders/${o1._id}/status`).set(authHeader(A)).send({ status: 'cancelled' })).status).toBe(409);
    expect(await stockOf(p2._id)).toBe(before + 1);

    const o2 = await createOrder(ctx.api, TA, [{ product: p1._id, quantity: 1 }, { product: p2._id, quantity: 2 }]);
    const s1 = await stockOf(p1._id);
    const s2 = await stockOf(p2._id);
    await ctx.api.patch(`/api/v1/admin/orders/${o2._id}/status`).set(authHeader(A)).send({ status: 'confirmed' });
    await ctx.api.patch(`/api/v1/admin/orders/${o2._id}/status`).set(authHeader(A)).send({ status: 'cancelled' });
    expect(await stockOf(p1._id)).toBe(s1 + 1);
    expect(await stockOf(p2._id)).toBe(s2 + 2);

    const o3 = await createOrder(ctx.api, TA, [{ product: p1._id, quantity: 1 }]);
    for (const status of ['confirmed', 'processing']) {
      await ctx.api.patch(`/api/v1/admin/orders/${o3._id}/status`).set(authHeader(A)).send({ status });
    }
    const s3 = await stockOf(p1._id);
    await ctx.api.patch(`/api/v1/admin/orders/${o3._id}/status`).set(authHeader(A)).send({ status: 'cancelled' });
    expect(await stockOf(p1._id)).toBe(s3 + 1);

    const o4 = await createOrder(ctx.api, TA, [{ product: p1._id, quantity: 1 }]);
    for (const status of ['confirmed', 'processing', 'shipped']) {
      await ctx.api.patch(`/api/v1/admin/orders/${o4._id}/status`).set(authHeader(A)).send({ status });
    }
    expect((await ctx.api.patch(`/api/v1/admin/orders/${o4._id}/status`).set(authHeader(A)).send({ status: 'cancelled' })).status).toBe(409);
  });
});
