import { authHeader } from './testApp.js';

export async function createCategory(api, token, body) {
  const res = await api.post('/api/v1/admin/categories').set(authHeader(token)).send(body);
  if (res.status !== 201) {
    throw new Error(`createCategory failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.category;
}

export async function createProduct(api, token, body) {
  const res = await api.post('/api/v1/admin/products').set(authHeader(token)).send(body);
  if (res.status !== 201) {
    throw new Error(`createProduct failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.product;
}

export async function createOrder(api, token, items) {
  const res = await api.post('/api/v1/orders').set(authHeader(token)).send({ items });
  if (res.status !== 201) {
    throw new Error(`createOrder failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.order;
}
