import mongoose from 'mongoose';

export const PRODUCT_STATUSES = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

export const PRODUCT_STATUS_VALUES = Object.freeze(Object.values(PRODUCT_STATUSES));

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [2, 'Product name must be at least 2 characters'],
      maxlength: [150, 'Product name must be at most 150 characters'],
      index: true,
    },
    // Normalized (trimmed + uppercased) server-side; uniqueness enforced.
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      index: true,
      uppercase: true,
      trim: true,
    },
    description: { type: String, default: '', trim: true, maxlength: [2000, 'Description is too long'] },
    price: { type: Number, required: [true, 'Price is required'], min: [0, 'Price must be non-negative'] },
    salePrice: {
      type: Number,
      default: null,
      min: [0, 'Sale price must be non-negative'],
      validate: {
        validator(v) {
          return v === null || v === undefined || v <= this.price;
        },
        message: 'Sale price must not exceed price',
      },
    },
    stock: {
      type: Number,
      required: [true, 'Stock is required'],
      min: [0, 'Stock must be non-negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Stock must be an integer',
      },
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
      index: true,
    },
    status: { type: String, enum: PRODUCT_STATUS_VALUES, default: PRODUCT_STATUSES.ACTIVE, index: true },
  },
  { timestamps: true },
);

productSchema.index({ status: 1, category: 1 });
productSchema.index({ price: 1 });

export const Product = mongoose.models.Product ?? mongoose.model('Product', productSchema);

/** Effective display price: valid salePrice wins, otherwise base price. */
export function effectivePriceOf(p) {
  if (p?.salePrice !== null && p?.salePrice !== undefined && p.salePrice <= p.price) {
    return p.salePrice;
  }
  return p?.price;
}
