import { body } from 'express-validator';

const FORBIDDEN_PROFILE_FIELDS = ['role', 'isActive', 'passwordHash', 'email'];

export const updateMeValidators = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2-100 characters'),
  body('newPassword')
    .optional()
    .isLength({ min: 8, max: 128 })
    .withMessage('New password must be 8-128 characters')
    .matches(/[A-Za-z]/)
    .withMessage('New password must contain a letter')
    .matches(/[0-9]/)
    .withMessage('New password must contain a number'),
  body('currentPassword')
    .if((_value, { req }) => req.body?.newPassword !== undefined)
    .notEmpty()
    .withMessage('Current password is required to set a new password'),
  // Profile endpoint must never accept privilege / identity fields.
  body().custom((value) => {
    const present = FORBIDDEN_PROFILE_FIELDS.filter((f) => value?.[f] !== undefined);
    if (present.length > 0) {
      throw new Error(`Field(s) not allowed: ${present.join(', ')}`);
    }
    return true;
  }),
];
