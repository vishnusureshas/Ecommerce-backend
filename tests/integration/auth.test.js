import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { execFile } from 'node:child_process';
import { authHeader, loginAs, registerUser, seedAdmin, startTestApp } from '../helpers/testApp.js';
import { User } from '../../src/modules/users/user.model.js';

let ctx;
beforeAll(async () => {
  ctx = await startTestApp();
}, 120000);
afterAll(async () => {
  await ctx.stop();
}, 60000);

describe('POST /api/v1/auth/register', () => {
  it('registers a customer with token and no password hash', async () => {
    const res = await ctx.api.post('/api/v1/auth/register').send({ name: 'Asha', email: 'asha@example.com', password: 'Secret123' });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'asha@example.com', role: 'customer' });
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('signs minimal JWT claims (sub + role only)', async () => {
    const { token } = await registerUser(ctx.api, { name: 'Claims', email: 'claims@example.com', password: 'Secret123' });
    const payload = jwt.decode(token);
    expect(payload).toMatchObject({ role: 'customer' });
    expect(payload.sub).toEqual(expect.any(String));
    expect(payload.passwordHash ?? payload.password).toBeUndefined();
  });

  it('rejects duplicate emails case-insensitively with 409', async () => {
    const res = await ctx.api.post('/api/v1/auth/register').send({ name: 'Again', email: 'ASHA@example.com', password: 'Secret123' });
    expect(res.status).toBe(409);
  });

  it('rejects client-supplied role/isActive with 400', async () => {
    const res = await ctx.api.post('/api/v1/auth/register').send({ name: 'Mallory', email: 'mallory@example.com', password: 'Secret123', role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('rejects weak passwords and bad emails with 400', async () => {
    const weak = await ctx.api.post('/api/v1/auth/register').send({ name: 'Weak', email: 'weak@example.com', password: 'short' });
    const badEmail = await ctx.api.post('/api/v1/auth/register').send({ name: 'Bad', email: 'not-an-email', password: 'Secret123' });
    expect(weak.status).toBe(400);
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error.details[0]).toMatchObject({ field: 'email' });
  });
});

describe('POST /api/v1/auth/login', () => {
  it('logs in with valid credentials', async () => {
    const res = await ctx.api.post('/api/v1/auth/login').send({ email: 'asha@example.com', password: 'Secret123' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
  });

  it('returns generic 401s without user enumeration', async () => {
    const wrong = await ctx.api.post('/api/v1/auth/login').send({ email: 'asha@example.com', password: 'Wrong1234' });
    const unknown = await ctx.api.post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'Wrong1234' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('rejects deactivated accounts with 403', async () => {
    await User.updateOne({ email: 'asha@example.com' }, { isActive: false });
    const res = await ctx.api.post('/api/v1/auth/login').send({ email: 'asha@example.com', password: 'Secret123' });
    expect(res.status).toBe(403);
    await User.updateOne({ email: 'asha@example.com' }, { isActive: true });
  });
});

describe('profile endpoints', () => {
  let token;
  beforeAll(async () => {
    ({ token } = await loginAs(ctx.api, 'asha@example.com', 'Secret123'));
  });

  it('requires authentication (401) and rejects bad tokens', async () => {
    const anon = await ctx.api.get('/api/v1/users/me');
    const bad = await ctx.api.get('/api/v1/users/me').set(authHeader('garbage'));
    expect(anon.status).toBe(401);
    expect(bad.status).toBe(401);
  });

  it('returns the safe profile', async () => {
    const res = await ctx.api.get('/api/v1/users/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('asha@example.com');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('updates the name and blocks role escalation', async () => {
    const rename = await ctx.api.patch('/api/v1/users/me').set(authHeader(token)).send({ name: 'Asha K' });
    expect(rename.body.data.user.name).toBe('Asha K');
    const escalate = await ctx.api.patch('/api/v1/users/me').set(authHeader(token)).send({ role: 'admin' });
    expect(escalate.status).toBe(400);
    const me = await ctx.api.get('/api/v1/users/me').set(authHeader(token));
    expect(me.body.data.user.role).toBe('customer');
  });

  it('changes the password only with the correct current password', async () => {
    const wrongCurrent = await ctx.api.patch('/api/v1/users/me').set(authHeader(token)).send({ currentPassword: 'Nope12345', newPassword: 'Another123' });
    expect(wrongCurrent.status).toBe(401);
    const changed = await ctx.api.patch('/api/v1/users/me').set(authHeader(token)).send({ currentPassword: 'Secret123', newPassword: 'NewSecret456' });
    expect(changed.status).toBe(200);
    const loginNew = await ctx.api.post('/api/v1/auth/login').send({ email: 'asha@example.com', password: 'NewSecret456' });
    const loginOld = await ctx.api.post('/api/v1/auth/login').send({ email: 'asha@example.com', password: 'Secret123' });
    expect(loginNew.status).toBe(200);
    expect(loginOld.status).toBe(401);
  });

  it('stores bcrypt hashes, never plaintext', async () => {
    const stored = await User.findOne({ email: 'asha@example.com' }).select('+passwordHash');
    expect(stored.passwordHash).not.toBe('NewSecret456');
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
  });
});

describe('scripts/create-admin.js', () => {
  it('seeds an admin and refuses duplicates', async () => {
    const run = (args) =>
      new Promise((resolve) => {
        execFile('node', ['scripts/create-admin.js', ...args], { cwd: process.cwd(), env: { ...process.env, MONGODB_URI: ctx.replset.getUri() } }, (err, stdout, stderr) =>
          resolve({ code: err?.code ?? 0, out: `${stdout}${stderr}` }),
        );
      });
    const first = await run(['--email=seeded@example.com', '--password=Seeded1234', '--name=Seeded']);
    expect(first.code).toBe(0);
    const admin = await User.findOne({ email: 'seeded@example.com' });
    expect(admin?.role).toBe('admin');
    const second = await run(['--email=seeded@example.com', '--password=Seeded1234']);
    expect(second.code).toBe(1);
  }, 60000);
});

describe('authorize middleware', () => {
  it('lets admins seed and log in (used by later suites)', async () => {
    const { user } = await seedAdmin(ctx.api, 'suite-admin@example.com');
    expect(user.role).toBe('admin');
  });
});
