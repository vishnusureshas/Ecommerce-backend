import mongoose from 'mongoose';
import { AppError } from '../common/errors/AppError.js';
import { env } from '../config/env.js';

function isDuplicateKeyError(err) {
  return err?.code === 11000 || err?.name === 'MongoServerError';
}

function toDuplicateMessage(err) {
  const field = err?.keyValue ? Object.keys(err.keyValue)[0] : undefined;
  return field ? `Duplicate value for '${field}'` : 'Duplicate resource';
}

/**
 * Centralized error handler — the last middleware in the chain.
 * - AppError → its status/code/message.
 * - Mongoose ValidationError → 400 with per-field details.
 * - Duplicate key (E11000) → 409.
 * - CastError (malformed ObjectId) → 400.
 * - Malformed JSON body → 400.
 * - Expired/invalid JWT → 401 (used by auth middleware in Section 3).
 * - Everything else → 500, generic message in production; the stack is
 *   logged server-side only and never sent to clients.
 */
export function errorHandler(err, req, res, _next) {
  const requestId = req?.id;

  const send = (status, code, message, details = undefined) =>
    res.status(status).json({
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
      ...(requestId ? { requestId } : {}),
    });

  // Malformed JSON body (thrown by express.json before routes run)
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return send(400, 'BAD_REQUEST', 'Malformed JSON body');
  }

  if (err instanceof AppError) {
    return send(err.statusCode, err.code, err.message, err.details);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors ?? {}).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return send(400, 'VALIDATION_ERROR', 'Request validation failed', details);
  }

  if (isDuplicateKeyError(err)) {
    return send(409, 'CONFLICT', toDuplicateMessage(err));
  }

  if (err instanceof mongoose.Error.CastError) {
    return send(400, 'BAD_REQUEST', `Invalid value for '${err.path}'`);
  }

  if (err?.name === 'TokenExpiredError') {
    return send(401, 'UNAUTHORIZED', 'Token expired');
  }

  if (err?.name === 'JsonWebTokenError') {
    return send(401, 'UNAUTHORIZED', 'Invalid token');
  }

  const status = err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
  if (status < 500) {
    return send(status, err?.code ?? 'BAD_REQUEST', err?.message ?? 'Bad request');
  }

  // Unexpected error: log with request ID + stack, hide internals.
  (req?.log ?? console).error?.({ err, requestId }, 'Unhandled error');
  return send(
    500,
    'INTERNAL_ERROR',
    env.nodeEnv === 'production' ? 'Internal server error' : (err?.message ?? 'Internal server error'),
  );
}
