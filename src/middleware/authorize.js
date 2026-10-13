import { AppError } from '../common/errors/AppError.js';

/**
 * Role gate, e.g. `authorize('admin')`. Returns 403 when the authenticated
 * user lacks the required role. Always applied server-side on Admin routes.
 */
export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(AppError.forbidden('Insufficient permissions'));
    }
    next();
  };
}
