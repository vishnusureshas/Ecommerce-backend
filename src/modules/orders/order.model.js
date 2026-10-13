import mongoose from 'mongoose';
import { ORDER_STATUS_VALUES, ORDER_STATUSES } from '../../common/constants/order-statuses.js';

const orderItemSchema = new mongoose.Schema(
  {
    // Snapshot fields (name/sku/unitPrice) preserve history if the product changes later.
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    // Always computed server-side; never accepted from clients.
    subtotal: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUS_VALUES, default: ORDER_STATUSES.PENDING, index: true },
  },
  { timestamps: true },
);

orderSchema.index({ user: 1, createdAt: -1 });

export const Order = mongoose.models.Order ?? mongoose.model('Order', orderSchema);
