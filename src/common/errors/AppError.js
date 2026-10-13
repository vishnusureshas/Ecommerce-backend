/**
 * Application error with an HTTP status code, a safe client-facing message,
 * and an optional machine-readable error code.
 *
 * Services throw these (or Mongoose/validation errors, which the
 * centralized error handler translates). Controllers stay free of
 * error-formatting logic.
 */
export class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details = undefined } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static badRequest(message = 'Bad request', opts = {}) {
    return new AppError(message, { statusCode: 400, code: 'BAD_REQUEST', ...opts });
  }

  static unauthorized(message = 'Authentication required', opts = {}) {
    return new AppError(message, { statusCode: 401, code: 'UNAUTHORIZED', ...opts });
  }

  static forbidden(message = 'Forbidden', opts = {}) {
    return new AppError(message, { statusCode: 403, code: 'FORBIDDEN', ...opts });
  }

  static notFound(message = 'Resource not found', opts = {}) {
    return new AppError(message, { statusCode: 404, code: 'NOT_FOUND', ...opts });
  }

  static conflict(message = 'Resource conflict', opts = {}) {
    return new AppError(message, { statusCode: 409, code: 'CONFLICT', ...opts });
  }
}
