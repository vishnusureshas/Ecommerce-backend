import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import * as userController from './user.controller.js';
import { updateMeValidators } from './user.validators.js';

const router = Router();

// All profile routes require authentication.
router.use(authenticate);

router.get('/me', asyncHandler(userController.getMe));
router.patch('/me', updateMeValidators, validateRequest, asyncHandler(userController.updateMe));

export default router;
