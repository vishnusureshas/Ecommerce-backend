import { body } from 'express-validator';

const FORBIDDEN_REGISTER_FIELDS = ['role', 'isActive', 'passwordHash'];

function rejectPrivilegedFields(value) {
  const present = FORBIDDEN_REGISTER_FIELDS.filter((f) => value?.[f] !== undefined);
  if (present.length > 0) {
    throw new Error(`Field(s) not allowed: ${present.join(', ')}`);
  }
  return true;
}

export const registerValidators = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2-100 characters'),
  body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain a letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number'),
  // Public registration must never assign Admin role / activation state.
  body().custom(rejectPrivilegedFields),
];

export const loginValidators = [
  body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];
