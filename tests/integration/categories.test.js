import mongoose from 'mongoose';
import { authHeader, registerUser, seedAdmin, startTestApp } from '../helpers/testApp.js';
import { createCategory } from '../helpers/testData.js';
import { Category } from '../../src/modules/categories/category.model.js';
import { collectCategorySubtreeIds } from '../../src/modules/categories/category.service.js';

let ctx;
let A;
let C;
let E;
let M;
let S;
beforeAll(async () => {
  ctx = await startTestApp();
  ({ token: A } = await seedAdmin(ctx.api));
  ({ token: C } = await registerUser(ctx.api, { name: 'Cust', email: 'cust@example.com', password: 'Secret123' }));
  E = (await createCategory(ctx.api, A, { name: 'Electronics' }))._id;
  M = (await createCategory(ctx.api, A, { name: 'Mobiles', parent: E }))._id;
  S = (await createCategory(ctx.api, A, { name: 'Smartphones', parent: M }))._id;
}, 120000);
afterAll(async () => {
  await ctx.stop();
}, 60000);

describe('category access control', () => {
  it('401 without token, 403 for customers on admin create; public list is open', async () => {
    const noAuth = await ctx.api.post('/api/v1/admin/categories').send({ name: 'X' });
    const asCustomer = await ctx.api.post('/api/v1/admin/categories').set(authHeader(C)).send({ name: 'X' });
    const pub = await ctx.api.get('/api/v1/categories');
    expect(noAuth.status).toBe(401);
    expect(asCustomer.status).toBe(403);
    expect(pub.status).toBe(200);
  });
});

describe('POST /api/v1/admin/categories', () => {
  it('creates roots with server-generated slugs', async () => {
    const res = await ctx.api.post('/api/v1/admin/categories').set(authHeader(A)).send({ name: 'Audio' });
    expect(res.status).toBe(201);
    expect(res.body.data.category).toMatchObject({ slug: 'audio', parent: null });
    await ctx.api.delete(`/api/v1/admin/categories/${res.body.data.category._id}`).set(authHeader(A));
  });

  it('rejects missing parents (400), missing names (400), client slugs (400)', async () => {
    const missingParent = await ctx.api.post('/api/v1/admin/categories').set(authHeader(A)).send({ name: 'Ghost', parent: new mongoose.Types.ObjectId() });
    const noName = await ctx.api.post('/api/v1/admin/categories').set(authHeader(A)).send({});
    const slugInject = await ctx.api.post('/api/v1/admin/categories').set(authHeader(A)).send({ name: 'Tablets', slug: 'custom' });
    expect(missingParent.status).toBe(400);
    expect(noName.status).toBe(400);
    expect(slugInject.status).toBe(400);
  });

  it('uniquifies duplicate slugs', async () => {
    const dup = await ctx.api.post('/api/v1/admin/categories').set(authHeader(A)).send({ name: 'Electronics' });
    expect(dup.status).toBe(201);
    expect(dup.body.data.category.slug).toBe('electronics-2');
    await ctx.api.delete(`/api/v1/admin/categories/${dup.body.data.category._id}`).set(authHeader(A));
  });
});

describe('category tree and listing', () => {
  it('returns 3-level nesting with inactive children flagged, not pruned', async () => {
    const legacy = await createCategory(ctx.api, A, { name: 'Legacy', parent: E, isActive: false });
    const res = await ctx.api.get('/api/v1/categories/tree');
    const root = res.body.data.find((r) => r._id === E);
    expect(root.children.some((c) => c._id === M && c.children.some((g) => g._id === S))).toBe(true);
    expect(root.children.some((c) => c.name === 'Legacy' && c.isActive === false)).toBe(true);
    await ctx.api.delete(`/api/v1/admin/categories/${legacy._id}`).set(authHeader(A));
  });

  it('serves a flat paginated list and details (400/404 on bad ids)', async () => {
    const list = await ctx.api.get('/api/v1/categories');
    expect(list.body.data.total).toBeGreaterThanOrEqual(3);
    const one = await ctx.api.get(`/api/v1/categories/${M}`);
    expect(one.body.data.category.name).toBe('Mobiles');
    expect((await ctx.api.get('/api/v1/categories/nope')).status).toBe(400);
    expect((await ctx.api.get(`/api/v1/categories/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });

  it('serves /tree without it being swallowed by /:id', async () => {
    const res = await ctx.api.get('/api/v1/categories/tree');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('PATCH /api/v1/admin/categories/:id', () => {
  it('renames (regenerating slug) and re-parents validly, including to root', async () => {
    const rename = await ctx.api.patch(`/api/v1/admin/categories/${M}`).set(authHeader(A)).send({ name: 'Mobile Phones' });
    expect(rename.body.data.category.slug).toBe('mobile-phones');
    const move = await ctx.api.patch(`/api/v1/admin/categories/${S}`).set(authHeader(A)).send({ parent: E });
    expect(String(move.body.data.category.parent)).toBe(String(E));
    const back = await ctx.api.patch(`/api/v1/admin/categories/${S}`).set(authHeader(A)).send({ parent: M });
    expect(String(back.body.data.category.parent)).toBe(String(M));
    const toRoot = await ctx.api.patch(`/api/v1/admin/categories/${M}`).set(authHeader(A)).send({ parent: null });
    expect(toRoot.body.data.category.parent).toBeNull();
    await ctx.api.patch(`/api/v1/admin/categories/${M}`).set(authHeader(A)).send({ parent: E });
  });

  it('rejects self-parenting and ancestor-beneath-descendant moves with 400', async () => {
    const self = await ctx.api.patch(`/api/v1/admin/categories/${E}`).set(authHeader(A)).send({ parent: E });
    const cycle = await ctx.api.patch(`/api/v1/admin/categories/${E}`).set(authHeader(A)).send({ parent: S });
    expect(self.status).toBe(400);
    expect(cycle.status).toBe(400);
  });
});

describe('collectCategorySubtreeIds', () => {
  it('collects root plus descendants and 404s on missing roots', async () => {
    // Mobiles subtree: itself + Smartphones (Legacy fixture was deleted above)
    await expect(collectCategorySubtreeIds(M)).resolves.toHaveLength(2);
    await expect(collectCategorySubtreeIds(new mongoose.Types.ObjectId())).rejects.toMatchObject({ statusCode: 404 });
  });

  it('terminates on corrupt cycles via the visited set', async () => {
    const aId = new mongoose.Types.ObjectId();
    const bId = new mongoose.Types.ObjectId();
    await Category.create([
      { _id: aId, name: 'LoopA', slug: 'loopa', parent: bId },
      { _id: bId, name: 'LoopB', slug: 'loopb', parent: aId },
    ]);
    await expect(collectCategorySubtreeIds(aId)).resolves.toHaveLength(2);
    await Category.deleteMany({ _id: { $in: [aId, bId] } });
  });
});

describe('DELETE /api/v1/admin/categories/:id', () => {
  it('409s while children exist, deletes leaves with 204', async () => {
    const blocked = await ctx.api.delete(`/api/v1/admin/categories/${M}`).set(authHeader(A));
    expect(blocked.status).toBe(409);
    const leaf = await ctx.api.delete(`/api/v1/admin/categories/${S}`).set(authHeader(A));
    expect(leaf.status).toBe(204);
    expect((await ctx.api.get(`/api/v1/categories/${S}`)).status).toBe(404);
    const nowLeaf = await ctx.api.delete(`/api/v1/admin/categories/${M}`).set(authHeader(A));
    expect(nowLeaf.status).toBe(204);
    expect((await ctx.api.delete(`/api/v1/admin/categories/${M}`).set(authHeader(A))).status).toBe(404);
  });
});
