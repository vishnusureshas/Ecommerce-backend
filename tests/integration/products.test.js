import mongoose from 'mongoose';
import { authHeader, registerUser, seedAdmin, startTestApp } from '../helpers/testApp.js';
import { createCategory, createProduct } from '../helpers/testData.js';

let ctx;
let A;
let C;
let E;
let M;
let L;
let p1;
let p2;
let p3;
let p4;
beforeAll(async () => {
  ctx = await startTestApp();
  ({ token: A } = await seedAdmin(ctx.api));
  ({ token: C } = await registerUser(ctx.api, { name: 'Cust', email: 'cust@example.com', password: 'Secret123' }));
  E = (await createCategory(ctx.api, A, { name: 'Electronics' }))._id;
  M = (await createCategory(ctx.api, A, { name: 'Mobiles', parent: E }))._id;
  L = (await createCategory(ctx.api, A, { name: 'Legacy', parent: null, isActive: false }))._id;
  p1 = await createProduct(ctx.api, A, { name: 'Pixel Phone (2024)', sku: 'PH-1', description: 'A great phone', price: 100, stock: 10, category: M });
  p2 = await createProduct(ctx.api, A, { name: 'Galaxy Phone', sku: 'GLX-2', price: 120, salePrice: 70, stock: 5, category: M });
  p3 = await createProduct(ctx.api, A, { name: 'Old Radio', sku: 'RAD-9', price: 50, stock: 3, category: L });
  p4 = await createProduct(ctx.api, A, { name: 'Draft Laptop', sku: 'LAP-4', price: 500, stock: 2, category: E, status: 'inactive' });
}, 120000);
afterAll(async () => {
  await ctx.stop();
}, 60000);

describe('product creation', () => {
  it('computes effective prices and guards admin access', async () => {
    expect(p1.effectivePrice).toBe(100);
    expect(p2.effectivePrice).toBe(70);
    const noAuth = await ctx.api.post('/api/v1/admin/products').send({ name: 'X', sku: 'X-1', price: 1, stock: 1, category: E });
    const asCustomer = await ctx.api.post('/api/v1/admin/products').set(authHeader(C)).send({ name: 'X', sku: 'X-1', price: 1, stock: 1, category: E });
    expect(noAuth.status).toBe(401);
    expect(asCustomer.status).toBe(403);
  });

  it('409s normalized duplicate SKUs', async () => {
    const res = await ctx.api.post('/api/v1/admin/products').set(authHeader(A)).send({ name: 'Copy', sku: 'ph-1', price: 10, stock: 1, category: E });
    expect(res.status).toBe(409);
  });

  it('400s invalid price/sale/stock/category', async () => {
    const cases = [
      { name: 'B', sku: 'B-1', price: -5, stock: 1, category: E },
      { name: 'B', sku: 'B-2', price: 100, salePrice: 200, stock: 1, category: E },
      { name: 'B', sku: 'B-3', price: 10, stock: 2.5, category: E },
      { name: 'B', sku: 'B-4', price: 10, stock: 1, category: new mongoose.Types.ObjectId() },
      { name: 'B', sku: 'B-5', price: 10, stock: 1, category: 'bad' },
    ];
    for (const body of cases) {
      const res = await ctx.api.post('/api/v1/admin/products').set(authHeader(A)).send(body);
      expect(res.status).toBe(400);
    }
  });
});

describe('product visibility', () => {
  it('hides inactive products and inactive-category chains publicly; admin sees all', async () => {
    const pub = await ctx.api.get('/api/v1/products');
    const adm = await ctx.api.get('/api/v1/admin/products').set(authHeader(A));
    expect(pub.body.data.total).toBe(2);
    expect(adm.body.data.total).toBe(4);
    const filtered = await ctx.api.get('/api/v1/admin/products?status=inactive').set(authHeader(A));
    expect(filtered.body.data.items[0].sku).toBe('LAP-4');
  });

  it('404s hidden products on public detail, with populated category otherwise', async () => {
    const visible = await ctx.api.get(`/api/v1/products/${p1._id}`);
    expect(visible.body.data.product.category.slug).toBe('mobiles');
    expect((await ctx.api.get(`/api/v1/products/${p3._id}`)).status).toBe(404);
    expect((await ctx.api.get(`/api/v1/products/${p4._id}`)).status).toBe(404);
  });
});

describe('product search and filters', () => {
  it('searches name/description/SKU and stays regex-safe', async () => {
    const byName = await ctx.api.get('/api/v1/products?search=phone');
    const byDesc = await ctx.api.get('/api/v1/products?search=great');
    const byParens = await ctx.api.get('/api/v1/products?search=(2024)');
    const bySku = await ctx.api.get('/api/v1/products?search=glx');
    expect(byName.body.data.total).toBe(2);
    expect(byDesc.body.data.total).toBe(1);
    expect(byParens.body.data.total).toBe(1);
    expect(bySku.body.data.total).toBe(1);
  });

  it('expands parent categories to all descendants', async () => {
    const fromParent = await ctx.api.get(`/api/v1/products?category=${E}`);
    const fromChild = await ctx.api.get(`/api/v1/products?category=${M}`);
    const inactiveCat = await ctx.api.get(`/api/v1/products?category=${L}`);
    const inactiveCatAdmin = await ctx.api.get(`/api/v1/admin/products?category=${L}`).set(authHeader(A));
    expect(fromParent.body.data.total).toBe(2);
    expect(fromChild.body.data.total).toBe(2);
    expect(inactiveCat.body.data.total).toBe(0);
    expect(inactiveCatAdmin.body.data.total).toBe(1);
  });

  it('filters and sorts on the effective price', async () => {
    const max90 = await ctx.api.get('/api/v1/products?maxPrice=90');
    const min80 = await ctx.api.get('/api/v1/products?minPrice=80');
    expect(max90.body.data.items.map((p) => p.sku)).toEqual(['GLX-2']);
    expect(min80.body.data.items.map((p) => p.sku)).toEqual(['PH-1']);
    const priceAsc = await ctx.api.get('/api/v1/products?sortBy=price&sortOrder=asc');
    expect(priceAsc.body.data.items.map((p) => p.sku)).toEqual(['GLX-2', 'PH-1']);
  });

  it('400s bad ranges, sort fields, and sort orders', async () => {
    expect((await ctx.api.get('/api/v1/products?minPrice=100&maxPrice=10')).status).toBe(400);
    expect((await ctx.api.get('/api/v1/products?sortBy=nope')).status).toBe(400);
    expect((await ctx.api.get('/api/v1/products?sortOrder=up')).status).toBe(400);
  });

  it('paginates', async () => {
    const res = await ctx.api.get('/api/v1/products?limit=1&page=2');
    expect(res.body.data).toMatchObject({ total: 2, totalPages: 2 });
    expect(res.body.data.items).toHaveLength(1);
  });
});

describe('product update and delete', () => {
  it('updates with merged salePrice<=price enforcement and SKU uniqueness', async () => {
    const upd = await ctx.api.patch(`/api/v1/admin/products/${p1._id}`).set(authHeader(A)).send({ price: 90 });
    expect(upd.body.data.product.price).toBe(90);
    expect((await ctx.api.patch(`/api/v1/admin/products/${p1._id}`).set(authHeader(A)).send({ salePrice: 95 })).status).toBe(400);
    const sale = await ctx.api.patch(`/api/v1/admin/products/${p1._id}`).set(authHeader(A)).send({ salePrice: 80 });
    expect(sale.body.data.product.effectivePrice).toBe(80);
    expect((await ctx.api.patch(`/api/v1/admin/products/${p1._id}`).set(authHeader(A)).send({ sku: 'GLX-2' })).status).toBe(409);
    expect((await ctx.api.patch('/api/v1/admin/products/nope').set(authHeader(A)).send({ price: 1 })).status).toBe(400);
    expect((await ctx.api.patch(`/api/v1/admin/products/${new mongoose.Types.ObjectId()}`).set(authHeader(A)).send({ price: 1 })).status).toBe(404);
  });

  it('blocks category deletion while products reference it, then deletes cleanly', async () => {
    expect((await ctx.api.delete(`/api/v1/admin/categories/${M}`).set(authHeader(A))).status).toBe(409);
    expect((await ctx.api.delete(`/api/v1/admin/products/${p2._id}`).set(authHeader(A))).status).toBe(204);
    expect((await ctx.api.delete(`/api/v1/admin/products/${p1._id}`).set(authHeader(A))).status).toBe(204);
    expect((await ctx.api.get(`/api/v1/products/${p1._id}`)).status).toBe(404);
    expect((await ctx.api.delete(`/api/v1/admin/categories/${M}`).set(authHeader(A))).status).toBe(204);
  });
});
