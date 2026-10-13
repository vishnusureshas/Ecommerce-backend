import { body, query } from 'express-validator';
import { objectIdParam, paginationQueryValidators } from '../../common/validators/common.validators.js';
import { PRODUCT_STATUS_VALUES } from './product.model.js';

export const SORTABLE_PRODUCT_FIELDS = Object.freeze(['name', 'price', 'createdAt']);
export const SORT_ORDERS = Object.freeze(['asc', 'desc']);

const nameRule = (optional) =>
  (optional ? body('name').optional() : body('name')).trim().isLength({ min: 2, max: 150 }).withMessage('Product name must be 2-150 characters');

const skuRule = (optional) =>
  (optional ? body('sku').optional() : body('sku'))
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('SKU must be 2-50 characters')
    .matches(/^[A-Za-z0-9_.-]+$/)
    .withMessage('SKU may contain letters, numbers, dot, dash, underscore');

const priceRule = (field, optional) =>
  (optional ? body(field).optional() : body(field))
    .isFloat({ min: 0 })
    .withMessage(`${field} must be a non-negative number`)
    .toFloat();

export const createProductValidators = [
  nameRule(false),
  skuRule(false),
  body('description').optional().trim().isLength({ max: 2000 }).withMessage('Description is too long'),
  priceRule('price', false),
  priceRule('salePrice', true),
  body('salePrice').optional().custom((value, { req }) => {
    if (value !== undefined && req.body?.price !== undefined && Number(value) > Number(req.body.price)) {
      throw new Error('salePrice must not exceed price');
    }
    return true;
  }),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer').toInt(),
  body('category').isMongoId().withMessage('category must be a valid category ID'),
  body('status').optional().isIn(PRODUCT_STATUS_VALUES).withMessage(`status must be one of: ${PRODUCT_STATUS_VALUES.join(', ')}`),
];

export const updateProductValidators = [
  nameRule(true),
  skuRule(true),
  body('description').optional().trim().isLength({ max: 2000 }).withMessage('Description is too long'),
  priceRule('price', true),
  priceRule('salePrice', true),
  // salePrice-vs-price on merged values is enforced in the service (needs the stored doc).
  body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be a non-negative integer').toInt(),
  body('category').optional().isMongoId().withMessage('category must be a valid category ID'),
  body('status').optional().isIn(PRODUCT_STATUS_VALUES).withMessage(`status must be one of: ${PRODUCT_STATUS_VALUES.join(', ')}`),
];

export const productIdValidator = [objectIdParam('id')];

export const listProductsValidators = [
  ...paginationQueryValidators,
  query('search').optional().trim().isLength({ min: 1, max: 100 }).withMessage('search must be 1-100 characters'),
  query('category').optional().isMongoId().withMessage('category must be a valid category ID'),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('minPrice must be non-negative').toFloat(),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('maxPrice must be non-negative').toFloat(),
  query().custom((_v, { req }) => {
    const { minPrice, maxPrice } = req.query ?? {};
    if (minPrice !== undefined && maxPrice !== undefined && Number(minPrice) > Number(maxPrice)) {
      throw new Error('minPrice must not exceed maxPrice');
    }
    return true;
  }),
  query('sortBy').optional().isIn(SORTABLE_PRODUCT_FIELDS).withMessage(`sortBy must be one of: ${SORTABLE_PRODUCT_FIELDS.join(', ')}`),
  query('sortOrder').optional().isIn(SORT_ORDERS).withMessage('sortOrder must be asc or desc'),
];

export const adminListProductsValidators = [
  ...listProductsValidators,
  query('status').optional().isIn(PRODUCT_STATUS_VALUES).withMessage(`status must be one of: ${PRODUCT_STATUS_VALUES.join(', ')}`),
];
