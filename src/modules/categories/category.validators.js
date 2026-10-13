import { body, query } from 'express-validator';
import { objectIdParam, paginationQueryValidators } from '../../common/validators/common.validators.js';

function rejectClientSlug(value) {
  if (value?.slug !== undefined) {
    throw new Error('Field(s) not allowed: slug');
  }
  return true;
}

export const createCategoryValidators = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Category name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Category name must be 2-100 characters'),
  body('parent')
    .optional({ nullable: true })
    .isMongoId()
    .withMessage('parent must be a valid category ID or null'),
  body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive must be a boolean'),
  body().custom(rejectClientSlug),
];

export const updateCategoryValidators = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Category name must be 2-100 characters'),
  body('parent')
    .optional({ nullable: true })
    .isMongoId()
    .withMessage('parent must be a valid category ID or null'),
  body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive must be a boolean'),
  body().custom(rejectClientSlug),
];

export const categoryIdValidator = [objectIdParam('id')];

export const listCategoriesValidators = [
  ...paginationQueryValidators,
  query('isActive').optional().isBoolean().withMessage('isActive must be a boolean').toBoolean(),
];
