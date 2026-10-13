import mongoose from 'mongoose';
import { AppError } from '../../common/errors/AppError.js';
import { parsePagination, toPagedResult } from '../../common/utils/pagination.js';
import { Category } from './category.model.js';

/** Guard against already-corrupt data: never walk forever. */
const MAX_ANCESTOR_WALK = 100;

function slugify(name) {
  const slug = String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || 'category';
}

async function uniqueSlug(base, excludeId = null) {
  let slug = base;
  let counter = 2;
  for (;;) {
    const clash = await Category.findOne({
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id');
    if (!clash) return slug;
    slug = `${base}-${counter++}`;
  }
}

async function requireParentExists(parentId) {
  const parent = await Category.findById(parentId).select('_id');
  if (!parent) {
    throw AppError.badRequest('Parent category does not exist');
  }
  return parent;
}

/**
 * Walk upward from the proposed parent. Rejects self-parenting and any
 * move that would place a category beneath its own descendant.
 */
async function assertNoCycle(categoryId, proposedParentId) {
  if (String(proposedParentId) === String(categoryId)) {
    throw AppError.badRequest('Category cannot be its own parent');
  }

  let current = proposedParentId;
  let depth = 0;
  while (current) {
    if (++depth > MAX_ANCESTOR_WALK) {
      throw AppError.badRequest('Category hierarchy is too deep or contains a cycle');
    }
    if (String(current) === String(categoryId)) {
      throw AppError.badRequest('Circular hierarchy: parent is a descendant of this category');
    }
    const doc = await Category.findById(current).select('parent');
    if (!doc) break;
    current = doc.parent;
  }
}

function toCategoryPayload(doc) {
  const c = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: c._id,
    name: c.name,
    slug: c.slug,
    parent: c.parent ?? null,
    isActive: c.isActive,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function createCategory({ name, parent = null, isActive = true }) {
  if (parent !== null && parent !== undefined) {
    await requireParentExists(parent);
  }
  const slug = await uniqueSlug(slugify(name));
  const category = await Category.create({
    name: String(name).trim(),
    slug,
    parent: parent ?? null,
    isActive,
  });
  return toCategoryPayload(category);
}

export async function updateCategory(id, { name, parent, isActive }) {
  const category = await Category.findById(id);
  if (!category) {
    throw AppError.notFound('Category not found');
  }

  if (name !== undefined) {
    category.name = String(name).trim();
    category.slug = await uniqueSlug(slugify(category.name), category._id);
  }

  if (parent !== undefined) {
    if (parent === null) {
      category.parent = null;
    } else {
      await requireParentExists(parent);
      await assertNoCycle(category._id, parent);
      category.parent = parent;
    }
  }

  if (isActive !== undefined) {
    category.isActive = isActive;
  }

  await category.save();
  return toCategoryPayload(category);
}

export async function getCategoryById(id) {
  const category = await Category.findById(id);
  if (!category) {
    throw AppError.notFound('Category not found');
  }
  return toCategoryPayload(category);
}

export async function listCategories(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  // Query values arrive as strings (see product.service note); normalize.
  if (query.isActive !== undefined) filter.isActive = String(query.isActive) === 'true';
  const [docs, total] = await Promise.all([
    Category.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Category.countDocuments(filter),
  ]);
  return toPagedResult({ items: docs.map(toCategoryPayload), total, page, limit });
}

/**
 * Full hierarchy in O(n): one query, in-memory assembly.
 * Visibility policy: public tree/list endpoints include inactive categories
 * WITH their `isActive` flag (never silently pruned), so the tree is never
 * misleading. Product visibility separately requires an active category
 * chain (enforced in the product module, Section 6). Orphaned nodes whose
 * parent is missing (corrupt data) are surfaced as roots.
 */
export function buildCategoryTree(flatDocs) {
  const byId = new Map();
  for (const d of flatDocs) {
    const node = typeof d.toObject === 'function' ? { ...toCategoryPayload(d), children: [] } : { ...d, children: [] };
    byId.set(String(node._id), node);
  }

  const nodes = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  const roots = [];
  for (const node of nodes) {
    const parentKey = node.parent ? String(node.parent) : null;
    if (parentKey && byId.has(parentKey)) {
      byId.get(parentKey).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function getCategoryTree() {
  const docs = await Category.find().lean();
  return buildCategoryTree(docs.map(toCategoryPayload));
}

/**
 * Collect a category plus every descendant ID (bulk fetch + in-memory
 * traversal with a visited set, so corrupt cycles terminate). Used by
 * product filtering in Section 6.
 */
export async function collectCategorySubtreeIds(rootId) {
  const root = await Category.findById(rootId).select('_id');
  if (!root) {
    throw AppError.notFound('Category not found');
  }

  const docs = await Category.find().select('_id parent').lean();
  const childrenOf = new Map();
  for (const d of docs) {
    if (!d.parent) continue;
    const key = String(d.parent);
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(String(d._id));
  }

  const rootKey = String(root._id);
  const visited = new Set([rootKey]);
  const ids = [rootKey];
  const stack = [rootKey];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const child of childrenOf.get(current) ?? []) {
      if (!visited.has(child)) {
        visited.add(child);
        ids.push(child);
        stack.push(child);
      }
    }
  }
  return ids;
}

/**
 * Safe deletion: reject with 409 while child categories — or products
 * referencing this category — still exist. The Product model only exists
 * from Section 6 onward, so the check is skipped until it is registered.
 */
export async function deleteCategory(id) {
  const category = await Category.findById(id).select('_id');
  if (!category) {
    throw AppError.notFound('Category not found');
  }

  const childCount = await Category.countDocuments({ parent: id });
  if (childCount > 0) {
    throw AppError.conflict('Category has child categories and cannot be deleted');
  }

  const Product = mongoose.models.Product;
  if (Product) {
    const productCount = await Product.countDocuments({ category: id });
    if (productCount > 0) {
      throw AppError.conflict('Category is referenced by products and cannot be deleted');
    }
  }

  await Category.deleteOne({ _id: id });
}

/**
 * IDs of categories visible on public surfaces: a category is visible only
 * when it is active AND its entire ancestor chain is active. Bulk fetch +
 * memoized in-memory walk; corrupt cycles resolve as invisible (safe default).
 * Used by product listing/detail (Section 6) and order creation (Section 7).
 */
export async function getVisibleCategoryIds() {
  const docs = await Category.find().select('_id parent isActive').lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const memo = new Map();

  function isVisible(key, trail = new Set()) {
    if (memo.has(key)) return memo.get(key);
    const node = byId.get(key);
    if (!node || !node.isActive) {
      memo.set(key, false);
      return false;
    }
    if (!node.parent) {
      memo.set(key, true);
      return true;
    }
    const parentKey = String(node.parent);
    if (trail.has(key)) {
      memo.set(key, false);
      return false;
    }
    trail.add(key);
    const result = isVisible(parentKey, trail);
    memo.set(key, result);
    return result;
  }

  return [...byId.keys()].filter((key) => isVisible(key));
}
