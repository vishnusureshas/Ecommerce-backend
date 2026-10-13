/**
 * Wrap an async route/controller function so rejected promises and thrown
 * errors reach the centralized Express error handler via `next(err)`.
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
