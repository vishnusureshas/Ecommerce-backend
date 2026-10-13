import { pick } from '../../common/utils/pick.js';
import * as categoryService from './category.service.js';

export async function createCategory(req, res) {
  const input = pick(req.body, ['name', 'parent', 'isActive']);
  const category = await categoryService.createCategory(input);
  res.status(201).json({ success: true, data: { category } });
}

export async function updateCategory(req, res) {
  const input = pick(req.body, ['name', 'parent', 'isActive']);
  const category = await categoryService.updateCategory(req.params.id, input);
  res.status(200).json({ success: true, data: { category } });
}

export async function getCategory(req, res) {
  const category = await categoryService.getCategoryById(req.params.id);
  res.status(200).json({ success: true, data: { category } });
}

export async function listCategories(req, res) {
  const query = pick(req.query, ['page', 'limit', 'isActive']);
  const data = await categoryService.listCategories(query);
  res.status(200).json({ success: true, data });
}

export async function getTree(req, res) {
  void req;
  const tree = await categoryService.getCategoryTree();
  res.status(200).json({ success: true, data: tree });
}

export async function deleteCategory(req, res) {
  await categoryService.deleteCategory(req.params.id);
  res.status(204).end();
}
