import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/AppError.js';
import { User, toSafeUser } from '../users/user.model.js';

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

const normalizeEmail = (email) => String(email).toLowerCase().trim();

/** Register a Customer. Role is always `customer`; privileged fields are rejected upstream. */
export async function register({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);

  const existing = await User.findOne({ email: normalizedEmail }).select('_id');
  if (existing) {
    throw AppError.conflict('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  try {
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
    });
    return { user: toSafeUser(user), token: signToken(user) };
  } catch (err) {
    // Race between the check above and insert.
    if (err?.code === 11000) {
      throw AppError.conflict('Email already registered');
    }
    throw err;
  }
}

/** Login with generic errors (no user enumeration) and inactive-account guard. */
export async function login({ email, password }) {
  const user = await User.findOne({ email: normalizeEmail(email) }).select('+passwordHash');

  const invalid = AppError.unauthorized('Invalid credentials');
  if (!user) throw invalid;

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw invalid;

  if (!user.isActive) {
    throw AppError.forbidden('Account is deactivated');
  }

  return { user: toSafeUser(user), token: signToken(user) };
}
