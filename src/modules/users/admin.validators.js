import { body, query } from 'express-validator';
import { ROLE_VALUES } from '../../common/constants/roles.js';
import { objectIdParam, paginationQueryValidators } from '../../common/validators/common.validators.js';

export const adminListUsersValidators = [
  ...paginationQueryValidators,
  query('role').optional().isIn(ROLE_VALUES).withMessage(`role must be one of: ${ROLE_VALUES.join(', ')}`),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
    .toBoolean(),
];

export const adminUserIdValidator = [objectIdParam('id')];

export const adminSetStatusValidators = [
  objectIdParam('id'),
  body('isActive')
    .exists({ checkNull: true })
    .withMessage('isActive is required')
    .isBoolean({ strict: true })
    .withMessage('isActive must be a boolean'),
];
