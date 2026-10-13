import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import * as categoryController from './category.controller.js';
import {
  categoryIdValidator,
  createCategoryValidators,
  updateCategoryValidators,
} from './category.validators.js';

const router = Router();

// Every category-management route requires the admin role.
router.use(authenticate, authorize('admin'));

router.post('/', createCategoryValidators, validateRequest, asyncHandler(categoryController.createCategory));
router.patch(
  '/:id',
  [...categoryIdValidator, ...updateCategoryValidators],
  validateRequest,
  asyncHandler(categoryController.updateCategory),
);
router.delete('/:id', categoryIdValidator, validateRequest, asyncHandler(categoryController.deleteCategory));

export default router;
