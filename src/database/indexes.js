import { User } from '../modules/users/user.model.js';
import { Category } from '../modules/categories/category.model.js';
import { Product } from '../modules/products/product.model.js';
import { Order } from '../modules/orders/order.model.js';
import { logger } from '../logger/logger.js';

/**
 * Declared index inventory (enforced in the schemas):
 * - users: email (unique), role, isActive
 * - categories: slug (unique), parent, isActive
 * - products: sku (unique), name, category, status, price, (status, category)
 * - orders: user, status, (user, createdAt desc)
 *
 * Synchronized at server startup so every environment runs the same
 * indexes the queries were designed against (category parents/slugs,
 * product category+status+price filters and sorts, user/order listings).
 */
export const MODELS_WITH_INDEXES = [User, Category, Product, Order];

export async function ensureIndexes() {
  for (const model of MODELS_WITH_INDEXES) {
    await model.syncIndexes();
    logger.info({ model: model.modelName }, 'Indexes synchronized');
  }
}
