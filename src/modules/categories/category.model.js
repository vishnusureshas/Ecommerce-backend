import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters'],
      maxlength: [100, 'Category name must be at most 100 characters'],
    },
    // Normalized unique slug, always generated server-side (never client-supplied).
    slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    // Null = root category. Unlimited nesting via parent references.
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const Category =
  mongoose.models.Category ?? mongoose.model('Category', categorySchema);
