/**
 * JSON 404 handler. Registered after all routes, before the error handler.
 */
export function notFound(_req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
    requestId: _req.id,
  });
}
