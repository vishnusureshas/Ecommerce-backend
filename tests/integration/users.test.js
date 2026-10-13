import mongoose from 'mongoose';
import { authHeader, registerUser, seedAdmin, startTestApp } from '../helpers/testApp.js';

let ctx;
let A;
let C;
let adminId;
beforeAll(async () => {
  ctx = await startTestApp();
  ({ token: A, user: { _id: adminId } } = await seedAdmin(ctx.api));
  ({ token: C } = await registerUser(ctx.api, { name: 'Cust One', email: 'c1@example.com', password: 'Secret123' }));
  await registerUser(ctx.api, { name: 'Cust Two', email: 'c2@example.com', password: 'Secret123' });
  await registerUser(ctx.api, { name: 'Cust Three', email: 'c3@example.com', password: 'Secret123' });
  const { User } = await import('../../src/modules/users/user.model.js');
  await User.updateOne({ email: 'c3@example.com' }, { isActive: false });
}, 120000);
afterAll(async () => {
  await ctx.stop();
}, 60000);

describe('admin user access control', () => {
  it('401 without token, 403 for customers on list/get/status', async () => {
    const noAuth = await ctx.api.get('/api/v1/admin/users');
    const asCustomer = await ctx.api.get('/api/v1/admin/users').set(authHeader(C));
    const getAsCustomer = await ctx.api.get(`/api/v1/admin/users/${adminId}`).set(authHeader(C));
    const patchAsCustomer = await ctx.api.patch(`/api/v1/admin/users/${adminId}/status`).set(authHeader(C)).send({ isActive: false });
    expect(noAuth.status).toBe(401);
    expect(asCustomer.status).toBe(403);
    expect(getAsCustomer.status).toBe(403);
    expect(patchAsCustomer.status).toBe(403);
  });
});

describe('GET /api/v1/admin/users', () => {
  it('lists paginated users without password hashes', async () => {
    const res = await ctx.api.get('/api/v1/admin/users').set(authHeader(A));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(4);
    expect(res.body.data.items).toHaveLength(4);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('filters by role, isActive, and combined', async () => {
    const customers = await ctx.api.get('/api/v1/admin/users?role=customer').set(authHeader(A));
    const admins = await ctx.api.get('/api/v1/admin/users?role=admin').set(authHeader(A));
    const inactive = await ctx.api.get('/api/v1/admin/users?isActive=false').set(authHeader(A));
    const combo = await ctx.api.get('/api/v1/admin/users?role=customer&isActive=true').set(authHeader(A));
    expect(customers.body.data.total).toBe(3);
    expect(admins.body.data.total).toBe(1);
    expect(inactive.body.data.items[0].email).toBe('c3@example.com');
    expect(combo.body.data.total).toBe(2);
  });

  it('rejects invalid role/page/limit with 400', async () => {
    const badRole = await ctx.api.get('/api/v1/admin/users?role=superadmin').set(authHeader(A));
    const badPage = await ctx.api.get('/api/v1/admin/users?page=0').set(authHeader(A));
    const badLimit = await ctx.api.get('/api/v1/admin/users?limit=500').set(authHeader(A));
    expect(badRole.status).toBe(400);
    expect(badPage.status).toBe(400);
    expect(badLimit.status).toBe(400);
  });

  it('paginates with metadata', async () => {
    const res = await ctx.api.get('/api/v1/admin/users?limit=2&page=2').set(authHeader(A));
    expect(res.body.data).toMatchObject({ totalPages: 2, hasPrev: true, hasNext: false });
    expect(res.body.data.items).toHaveLength(2);
  });
});

describe('GET /api/v1/admin/users/:id', () => {
  it('returns one user, 400 on malformed id, 404 on missing', async () => {
    const list = await ctx.api.get('/api/v1/admin/users').set(authHeader(A));
    const id = list.body.data.items[0]._id;
    const one = await ctx.api.get(`/api/v1/admin/users/${id}`).set(authHeader(A));
    expect(one.status).toBe(200);
    const badId = await ctx.api.get('/api/v1/admin/users/not-an-id').set(authHeader(A));
    const missing = await ctx.api.get(`/api/v1/admin/users/${new mongoose.Types.ObjectId()}`).set(authHeader(A));
    expect(badId.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});

describe('PATCH /api/v1/admin/users/:id/status', () => {
  it('deactivates and reactivates, affecting login', async () => {
    const list = await ctx.api.get('/api/v1/admin/users?role=customer').set(authHeader(A));
    const target = list.body.data.items.find((u) => u.email === 'c2@example.com')._id;
    const off = await ctx.api.patch(`/api/v1/admin/users/${target}/status`).set(authHeader(A)).send({ isActive: false });
    expect(off.body.data.user.isActive).toBe(false);
    const loginOff = await ctx.api.post('/api/v1/auth/login').send({ email: 'c2@example.com', password: 'Secret123' });
    expect(loginOff.status).toBe(403);
    const on = await ctx.api.patch(`/api/v1/admin/users/${target}/status`).set(authHeader(A)).send({ isActive: true });
    const loginOn = await ctx.api.post('/api/v1/auth/login').send({ email: 'c2@example.com', password: 'Secret123' });
    expect(on.body.data.user.isActive).toBe(true);
    expect(loginOn.status).toBe(200);
  });

  it('rejects missing/string-boolean/status bodies and bad ids with 400', async () => {
    const list = await ctx.api.get('/api/v1/admin/users?role=customer').set(authHeader(A));
    const target = list.body.data.items[0]._id;
    const noField = await ctx.api.patch(`/api/v1/admin/users/${target}/status`).set(authHeader(A)).send({});
    const strBool = await ctx.api.patch(`/api/v1/admin/users/${target}/status`).set(authHeader(A)).send({ isActive: 'false' });
    const badId = await ctx.api.patch('/api/v1/admin/users/nope/status').set(authHeader(A)).send({ isActive: false });
    expect(noField.status).toBe(400);
    expect(strBool.status).toBe(400);
    expect(badId.status).toBe(400);
  });

  it('blocks self-deactivation', async () => {
    const res = await ctx.api.patch(`/api/v1/admin/users/${adminId}/status`).set(authHeader(A)).send({ isActive: false });
    expect(res.status).toBe(400);
    const me = await ctx.api.get('/api/v1/users/me').set(authHeader(A));
    expect(me.body.data.user.isActive).toBe(true);
  });
});
