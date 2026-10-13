import mongoose from 'mongoose';
import { AppError } from '../../common/errors/AppError.js';
import { parsePagination, toPagedResult } from '../../common/utils/pagination.js';
import { Category } from '../categories/category.model.js';
import { collectCategorySubtreeIds, getVisibleCategoryIds } from '../categories/category.service.js';
import { PRODUCT_STATUSES, Product, effectivePriceOf } from './product.model.js';

// sortBy allowlist -> aggregation sort key. `price` ALWAYS means the
// effective display price (salePrice when valid, else price) — the same
// basis used for min/maxPrice filtering.
const SORT_KEY = Object.freeze({ name: 'name', price: 'effectivePrice', createdAt: 'createdAt' });

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Aggregation $match does not auto-cast strings to ObjectId, so convert explicitly.
function toObjectIds(ids) {
  return ids.map((id) => new mongoose.Types.ObjectId(String(id)));
}

function toProductPayload(doc) {
  const p = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const category =
    p.category && typeof p.category === 'object' && p.category._id
      ? { _id: p.category._id, name: p.category.name, slug: p.category.slug }
      : (p.category ?? null);
  return {
    _id: p._id,
    name: p.name,
    sku: p.sku,
    description: p.description ?? '',
    price: p.price,
    salePrice: p.salePrice ?? null,
    effectivePrice: p.effectivePrice ?? effectivePriceOf(p),
    stock: p.stock,
    category,
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

async function requireCategoryExists(categoryId) {
  const category = await Category.findById(categoryId).select('_id');
  if (!category) {
    throw AppError.badRequest('Category does not exist');
  }
}

async function toUniqueViolation(err) {
  if (err?.code === 11000) {
    throw AppError.conflict('SKU already exists');
  }
  throw err;
}

export async function createProduct({ name, sku, description = '', price, salePrice = null, stock, category, status = PRODUCT_STATUSES.ACTIVE }) {
  await requireCategoryExists(category);

  if (salePrice !== null && salePrice !== undefined && salePrice > price) {
    throw AppError.badRequest('salePrice must not exceed price');
  }

  const existing = await Product.findOne({ sku: String(sku).toUpperCase().trim() }).select('_id');
  if (existing) {
    throw AppError.conflict('SKU already exists');
  }

  try {
    const product = await Product.create({
      name: String(name).trim(),
      sku: String(sku).trim(),
      description: String(description ?? ''),
      price,
      salePrice: salePrice ?? null,
      stock,
      category,
      status,
    });
    return toProductPayload(product);
  } catch (err) {
    await toUniqueViolation(err);
  }
}

export async function updateProduct(id, input = {}) {
  const product = await Product.findById(id);
  if (!product) {
    throw AppError.notFound('Product not found');
  }

  if (input.name !== undefined) product.name = String(input.name).trim();
  if (input.sku !== undefined) product.sku = String(input.sku).trim();
  if (input.description !== undefined) product.description = String(input.description ?? '');
  if (input.price !== undefined) product.price = input.price;
  if (input.salePrice !== undefined) product.salePrice = input.salePrice ?? null;
  if (input.stock !== undefined) product.stock = input.stock;
  if (input.status !== undefined) product.status = input.status;
  if (input.category !== undefined) {
    await requireCategoryExists(input.category);
    product.category = input.category;
  }

  // Enforce merged salePrice <= price with a clean 400 (schema also guards on save).
  const nextPrice = product.price;
  const nextSale = product.salePrice;
  if (nextSale !== null && nextSale !== undefined && nextSale > nextPrice) {
    throw AppError.badRequest('salePrice must not exceed price');
  }

  try {
    await product.save();
  } catch (err) {
    await toUniqueViolation(err);
  }
  return toProductPayload(product);
}

export async function getProductById(id, { includeInactive = false } = {}) {
  const product = await Product.findById(id).populate('category', '_id name slug isActive parent');
  if (!product) {
    throw AppError.notFound('Product not found');
  }
  if (!includeInactive) {
    const visible = await getVisibleCategoryIds();
    const visibleSet = new Set(visible.map(String));
    if (product.status !== PRODUCT_STATUSES.ACTIVE || !visibleSet.has(String(product.category?._id ?? product.category))) {
      throw AppError.notFound('Product not found');
    }
  }
  return toProductPayload(product);
}

/**
 * Search/filter/sort/paginate via a single aggregation:
 * - status + category scoping in $match (public: active status AND fully
 *   active category chain; admin: everything unless filtered),
 * - `category=<id>` expands to the whole descendant subtree,
 * - price range + sorting use the EFFECTIVE price consistently,
 * - search is regex-escaped across name/description/sku.
 */
export async function listProducts(query = {}, { includeInactive = false } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const sortBy = query.sortBy ?? 'createdAt';
  const sortOrder = query.sortOrder ?? 'desc';

  // NOTE: query values arrive as strings (Express 5 req.query is
  // getter-only, so validator sanitizers can't mutate them in place).
  // Validators reject malformed values; coerce here for the pipeline.
  const minPrice = query.minPrice !== undefined ? Number(query.minPrice) : undefined;
  const maxPrice = query.maxPrice !== undefined ? Number(query.maxPrice) : undefined;

  const match = {};
  if (!includeInactive) {
    match.status = PRODUCT_STATUSES.ACTIVE;
  } else if (query.status !== undefined) {
    match.status = query.status;
  }

  if (query.category !== undefined) {
    const subtree = await collectCategorySubtreeIds(query.category);
    if (!includeInactive) {
      const visible = new Set((await getVisibleCategoryIds()).map(String));
      match.category = { $in: toObjectIds(subtree.filter((id) => visible.has(String(id)))) };
    } else {
      match.category = { $in: toObjectIds(subtree) };
    }
  } else if (!includeInactive) {
    match.category = { $in: toObjectIds(await getVisibleCategoryIds()) };
  }

  const pipeline = [{ $match: match }];

  // Effective display price, mirroring effectivePriceOf().
  pipeline.push({
    $addFields: {
      effectivePrice: {
        $cond: [
          {
            $and: [
              { $ne: ['$salePrice', null] },
              { $lte: ['$salePrice', '$price'] },
            ],
          },
          '$salePrice',
          '$price',
        ],
      },
    },
  });

  if (minPrice !== undefined || maxPrice !== undefined) {
    const range = {};
    if (minPrice !== undefined) range.$gte = minPrice;
    if (maxPrice !== undefined) range.$lte = maxPrice;
    pipeline.push({ $match: { effectivePrice: range } });
  }

  if (query.search) {
    const rx = new RegExp(escapeRegExp(query.search), 'i');
    pipeline.push({ $match: { $or: [{ name: rx }, { description: rx }, { sku: rx }] } });
  }

  pipeline.push({
    $lookup: {
      from: 'categories',
      localField: 'category',
      foreignField: '_id',
      as: '_category',
    },
  });
  pipeline.push({ $sort: { [SORT_KEY[sortBy]]: sortOrder === 'asc' ? 1 : -1, _id: 1 } });
  pipeline.push({
    $facet: {
      items: [{ $skip: skip }, { $limit: limit }],
      total: [{ $count: 'count' }],
    },
  });

  const [result] = await Product.aggregate(pipeline);
  const total = result?.total?.[0]?.count ?? 0;
  const items = (result?.items ?? []).map((doc) => {
    const [cat] = doc._category ?? [];
    return toProductPayload({ ...doc, category: cat ?? doc.category });
  });

  return toPagedResult({ items, total, page, limit });
}

/**
 * Delete is safe by design: orders keep name/SKU/price snapshots, so no
 * history is lost. Returns nothing; the controller answers 204.
 */
export async function deleteProduct(id) {
  const product = await Product.findById(id).select('_id');
  if (!product) {
    throw AppError.notFound('Product not found');
  }
  await Product.deleteOne({ _id: id });
}
