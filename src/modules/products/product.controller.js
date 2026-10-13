import { pick } from '../../common/utils/pick.js';
import * as productService from './product.service.js';

const LIST_QUERY_KEYS = ['search', 'category', 'minPrice', 'maxPrice', 'sortBy', 'sortOrder', 'page', 'limit', 'status'];

export async function listProducts(req, res) {
  const data = await productService.listProducts(pick(req.query, LIST_QUERY_KEYS));
  res.status(200).json({ success: true, data });
}

export async function adminListProducts(req, res) {
  const data = await productService.listProducts(pick(req.query, LIST_QUERY_KEYS), { includeInactive: true });
  res.status(200).json({ success: true, data });
}

export async function getProduct(req, res) {
  const product = await productService.getProductById(req.params.id);
  res.status(200).json({ success: true, data: { product } });
}

export async function createProduct(req, res) {
  const input = pick(req.body, ['name', 'sku', 'description', 'price', 'salePrice', 'stock', 'category', 'status']);
  const product = await productService.createProduct(input);
  res.status(201).json({ success: true, data: { product } });
}

export async function updateProduct(req, res) {
  const input = pick(req.body, ['name', 'sku', 'description', 'price', 'salePrice', 'stock', 'category', 'status']);
  const product = await productService.updateProduct(req.params.id, input);
  res.status(200).json({ success: true, data: { product } });
}

export async function deleteProduct(req, res) {
  await productService.deleteProduct(req.params.id);
  res.status(204).end();
}
