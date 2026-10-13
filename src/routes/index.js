import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import adminUserRoutes from '../modules/users/admin.routes.js';
import categoryRoutes from '../modules/categories/category.routes.js';
import adminCategoryRoutes from '../modules/categories/category.admin.routes.js';
import productRoutes from '../modules/products/product.routes.js';
import adminProductRoutes from '../modules/products/product.admin.routes.js';
import orderRoutes from '../modules/orders/order.routes.js';
import adminOrderRoutes from '../modules/orders/order.admin.routes.js';

const apiRoutes = Router();

// Central API router. Feature routers are mounted here section by section:
// auth/users (Section 3-4), categories (Section 5), products (Section 6),
// orders (Section 7-8). Swagger docs mount in Section 9.
apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/users', userRoutes);
apiRoutes.use('/admin/users', adminUserRoutes);
apiRoutes.use('/categories', categoryRoutes);
apiRoutes.use('/admin/categories', adminCategoryRoutes);
apiRoutes.use('/products', productRoutes);
apiRoutes.use('/admin/products', adminProductRoutes);
apiRoutes.use('/orders', orderRoutes);
apiRoutes.use('/admin/orders', adminOrderRoutes);
apiRoutes.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    data: { name: 'ecommerce-api', version: 'v1' },
  });
});

export default apiRoutes;
