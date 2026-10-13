import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// Dynamic import keeps module load order safe (env/dotenv first, then app).
async function getApp() {
  const { createApp } = await import('../../src/app.js');
  return createApp();
}

/**
 * Boots an isolated in-memory MongoDB replica set (transactions enabled)
 * plus the Express app. Every test file gets its own instance via
 * beforeAll/afterAll so suites never share data.
 */
export async function startTestApp() {
  const replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri());
  const app = await getApp();
  return {
    app,
    api: request(app),
    replset,
    async stop() {
      await mongoose.disconnect();
      await replset.stop();
    },
  };
}

export async function registerUser(api, { name, email, password, role = 'customer' }) {
  const res = await api.post('/api/v1/auth/register').send({ name, email, password });
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  if (role !== 'customer') {
    const { User } = await import('../../src/modules/users/user.model.js');
    await User.updateOne({ email: email.toLowerCase() }, { role });
  }
  return res.body.data;
}

export async function loginAs(api, email, password) {
  const res = await api.post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

/** Register + promote + login an admin; returns { user, token }. */
export async function seedAdmin(api, email = 'admin@example.com', password = 'Admin1234') {
  await registerUser(api, { name: 'Admin', email, password, role: 'admin' });
  return loginAs(api, email, password);
}

export const authHeader = (token) => ({ Authorization: `Bearer ${token}` });
