import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import * as adminController from './admin.controller.js';
import {
  adminListUsersValidators,
  adminSetStatusValidators,
  adminUserIdValidator,
} from './admin.validators.js';

const router = Router();

// Every admin user route requires authentication + the admin role.
router.use(authenticate, authorize('admin'));

router.get('/', adminListUsersValidators, validateRequest, asyncHandler(adminController.listUsers));
router.get('/:id', adminUserIdValidator, validateRequest, asyncHandler(adminController.getUser));
router.patch(
  '/:id/status',
  adminSetStatusValidators,
  validateRequest,
  asyncHandler(adminController.setStatus),
);

export default router;
