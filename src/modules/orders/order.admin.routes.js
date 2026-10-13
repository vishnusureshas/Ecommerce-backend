import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import * as adminController from './order.admin.controller.js';
import { adminListOrdersValidators, adminSetStatusValidators } from './order.admin.validators.js';

const router = Router();

// Every order-administration route requires the admin role.
router.use(authenticate, authorize('admin'));

router.get('/', adminListOrdersValidators, validateRequest, asyncHandler(adminController.listOrders));
router.patch(
  '/:id/status',
  adminSetStatusValidators,
  validateRequest,
  asyncHandler(adminController.setStatus),
);

export default router;
