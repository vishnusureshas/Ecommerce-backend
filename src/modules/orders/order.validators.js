import { body } from 'express-validator';
import { objectIdParam, paginationQueryValidators } from '../../common/validators/common.validators.js';

// Reasonable caps: clients cannot stuff unbounded lines/quantities into one order.
export const MAX_ORDER_ITEMS = 20;
export const MAX_ITEM_QUANTITY = 50;

export const createOrderValidators = [
  body('items')
    .isArray({ min: 1, max: MAX_ORDER_ITEMS })
    .withMessage(`items must be an array of 1-${MAX_ORDER_ITEMS} products`),
  body('items.*.product').isMongoId().withMessage('items[].product must be a valid product ID'),
  body('items.*.quantity')
    .isInt({ min: 1, max: MAX_ITEM_QUANTITY })
    .withMessage(`items[].quantity must be an integer between 1 and ${MAX_ITEM_QUANTITY}`)
    .toInt(),
];

export const orderIdValidator = [objectIdParam('id')];

export const listMyOrdersValidators = [...paginationQueryValidators];
