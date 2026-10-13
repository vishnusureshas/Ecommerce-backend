import mongoose from 'mongoose';
import { ROLE_VALUES, ROLES } from '../../common/constants/roles.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name must be at most 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email address'],
    },
    // Never selected by default; login explicitly opts in via +passwordHash.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLE_VALUES, default: ROLES.CUSTOMER, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Defense in depth: strip internals even if a document is serialized directly.
function stripInternals(_doc, ret) {
  delete ret.passwordHash;
  delete ret.__v;
  return ret;
}
userSchema.set('toJSON', { transform: stripInternals });
userSchema.set('toObject', { transform: stripInternals });

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);

/** Project a user document/model into the safe API shape (no hashes). */
export function toSafeUser(doc) {
  if (!doc) return null;
  const u = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}
