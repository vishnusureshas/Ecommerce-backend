import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import * as productController from './product.controller.js';
import {
  adminListProductsValidators,
  createProductValidators,
  productIdValidator,
  updateProductValidators,
} from './product.validators.js';

const router = Router();

// Every product-management route requires the admin role.
router.use(authenticate, authorize('admin'));

router.get('/', adminListProductsValidators, validateRequest, asyncHandler(productController.adminListProducts));
router.post('/', createProductValidators, validateRequest, asyncHandler(productController.createProduct));
router.patch(
  '/:id',
  [...productIdValidator, ...updateProductValidators],
  validateRequest,
  asyncHandler(productController.updateProduct),
);
router.delete('/:id', productIdValidator, validateRequest, asyncHandler(productController.deleteProduct));

export default router;
