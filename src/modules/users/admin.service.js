import { AppError } from '../../common/errors/AppError.js';
import { parsePagination, toPagedResult } from '../../common/utils/pagination.js';
import { User, toSafeUser } from './user.model.js';

/** Paginated admin user listing with optional role / isActive filters. */
export async function listUsers(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.role !== undefined) filter.role = query.role;
  // Query values arrive as strings (see product.service note); normalize.
  if (query.isActive !== undefined) filter.isActive = String(query.isActive) === 'true';

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return toPagedResult({ items: users.map(toSafeUser), total, page, limit });
}

export async function getUserById(id) {
  const user = await User.findById(id);
  if (!user) {
    throw AppError.notFound('User not found');
  }
  return toSafeUser(user);
}

/**
 * Activate/deactivate a user. Admins cannot change their own status
 * (prevents accidental lockout of the last active admin).
 */
export async function setUserStatus(id, isActive, { actorId } = {}) {
  if (actorId && actorId === String(id)) {
    throw AppError.badRequest('Admins cannot change their own activation status');
  }

  const user = await User.findById(id);
  if (!user) {
    throw AppError.notFound('User not found');
  }

  user.isActive = isActive;
  await user.save();
  return toSafeUser(user);
}
