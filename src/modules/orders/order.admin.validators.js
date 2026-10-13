import { body, query } from 'express-validator';
import { objectIdParam, paginationQueryValidators } from '../../common/validators/common.validators.js';
import { ORDER_STATUS_VALUES } from '../../common/constants/order-statuses.js';

export const adminListOrdersValidators = [
  ...paginationQueryValidators,
  query('status')
    .optional()
    .isIn(ORDER_STATUS_VALUES)
    .withMessage(`status must be one of: ${ORDER_STATUS_VALUES.join(', ')}`),
  query('user').optional().isMongoId().withMessage('user must be a valid user ID'),
];

export const adminSetStatusValidators = [
  objectIdParam('id'),
  body('status')
    .isIn(ORDER_STATUS_VALUES)
    .withMessage(`status must be one of: ${ORDER_STATUS_VALUES.join(', ')}`),
];
