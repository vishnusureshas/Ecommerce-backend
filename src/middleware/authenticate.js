import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../common/errors/AppError.js';
import { asyncHandler } from '../common/utils/asyncHandler.js';
import { User } from '../modules/users/user.model.js';

/**
 * Verify the Bearer token and load the current user from the database,
 * so a deactivated (or deleted) user is blocked immediately — not at
 * token expiry. Attaches a safe identity object to `req.user`.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw AppError.unauthorized('Authentication required');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw AppError.unauthorized('Authentication required');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    // Generic message: no hint whether the token is malformed or expired.
    throw AppError.unauthorized('Invalid or expired token');
  }

  const user = await User.findById(payload.sub).select('_id name email role isActive');
  if (!user) {
    throw AppError.unauthorized('User no longer exists');
  }
  if (!user.isActive) {
    throw AppError.forbidden('Account is deactivated');
  }

  req.user = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
  next();
});
