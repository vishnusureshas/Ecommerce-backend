import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import * as orderController from './order.controller.js';
import {
  createOrderValidators,
  listMyOrdersValidators,
  orderIdValidator,
} from './order.validators.js';

const router = Router();

// All order routes require authentication. NOTE: /me is registered
// before /:id so "me" is never treated as an order ID.
router.use(authenticate);

router.post('/', createOrderValidators, validateRequest, asyncHandler(orderController.createOrder));
router.get('/me', listMyOrdersValidators, validateRequest, asyncHandler(orderController.listMyOrders));
router.get('/:id', orderIdValidator, validateRequest, asyncHandler(orderController.getOrder));

export default router;
