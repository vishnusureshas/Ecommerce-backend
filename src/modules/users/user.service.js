import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/AppError.js';
import { User, toSafeUser } from './user.model.js';

export async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw AppError.notFound('User not found');
  }
  return toSafeUser(user);
}

/**
 * Update own profile. Only `name` is editable here — `role`, `isActive`,
 * `email`, and `passwordHash` are never accepted (rejected by validators
 * and ignored by the controller allowlist). Password change requires the
 * current password and re-hashes the new one.
 */
export async function updateMe(userId, input = {}) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    throw AppError.notFound('User not found');
  }

  if (input.name !== undefined) {
    user.name = String(input.name).trim();
  }

  if (input.newPassword !== undefined) {
    if (!input.currentPassword) {
      throw AppError.badRequest('Current password is required to set a new password');
    }
    const match = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!match) {
      throw AppError.unauthorized('Current password is incorrect');
    }
    user.passwordHash = await bcrypt.hash(input.newPassword, env.bcryptRounds);
  }

  await user.save();
  return toSafeUser(user);
}
