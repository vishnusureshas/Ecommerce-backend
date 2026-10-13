import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import * as categoryController from './category.controller.js';
import {
  categoryIdValidator,
  listCategoriesValidators,
} from './category.validators.js';

const router = Router();

// Public category browsing. NOTE: /tree is registered before /:id.
router.get('/', listCategoriesValidators, validateRequest, asyncHandler(categoryController.listCategories));
router.get('/tree', asyncHandler(categoryController.getTree));
router.get('/:id', categoryIdValidator, validateRequest, asyncHandler(categoryController.getCategory));

export default router;
