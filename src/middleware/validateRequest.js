import { validationResult } from 'express-validator';

/**
 * Central express-validator result handler. Mount after a route's
 * validator chain: `router.post('/x', validators, validateRequest, handler)`.
 */
export function validateRequest(req, res, next) {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: result.array().map(({ path, msg }) => ({
          field: path,
          message: msg,
        })),
      },
      requestId: req.id,
    });
  }

  next();
}
