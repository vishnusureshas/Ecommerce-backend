import { randomUUID } from 'node:crypto';

/**
 * Attach a request ID at the application boundary so logs, error
 * responses, and downstream code can correlate a single request.
 * Honors an incoming `x-request-id` header; otherwise generates one.
 * Must run before request logging.
 */
export function requestContext(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && incoming.trim()
      ? incoming.trim().slice(0, 128)
      : randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
}
