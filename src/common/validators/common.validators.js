import { param, query } from 'express-validator';

/** Validate a route param as a MongoDB ObjectId before service calls. */
export const objectIdParam = (name = 'id') =>
  param(name).isMongoId().withMessage(`${name} must be a valid ObjectId`);

/** Shared bounded page/limit query validators for list endpoints. */
export const paginationQueryValidators = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be an integer >= 1').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),
];
