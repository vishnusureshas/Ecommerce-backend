import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import * as authController from './auth.controller.js';
import { loginValidators, registerValidators } from './auth.validators.js';

// Stricter than the global baseline: credential endpoints are brute-force targets.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, try again later' },
  },
});

const router = Router();

router.post('/register', authLimiter, registerValidators, validateRequest, asyncHandler(authController.register));
router.post('/login', authLimiter, loginValidators, validateRequest, asyncHandler(authController.login));

export default router;
