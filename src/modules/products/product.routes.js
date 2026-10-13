import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import * as productController from './product.controller.js';
import { listProductsValidators, productIdValidator } from './product.validators.js';

const router = Router();

// Public product browsing (active products in fully-active categories only).
router.get('/', listProductsValidators, validateRequest, asyncHandler(productController.listProducts));
router.get('/:id', productIdValidator, validateRequest, asyncHandler(productController.getProduct));

export default router;
