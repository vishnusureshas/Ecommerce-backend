import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { logger } from './logger/logger.js';
import apiRoutes from './routes/index.js';
import { setupSwagger } from './config/swagger.js';
import { requestContext } from './middleware/requestContext.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // 1-2. Security headers
  app.use(helmet());

  // 3. CORS with explicit origin
  app.use(cors({ origin: env.corsOrigin }));

  // 4. JSON body parsing with size limit
  app.use(express.json({ limit: '1mb' }));

  // Request ID boundary (must run before request logging)
  app.use(requestContext);

  // 5. HTTP request logging (redaction handled by shared logger)
  app.use(
    pinoHttp({
      logger,
      customLogLevel(_req, res, err) {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // 6. Rate limiting (focused on auth-heavy traffic; global baseline here,
  //    refined per-route in hardening section)
  const limiter = rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, try again later' },
        ...(req.id ? { requestId: req.id } : {}),
      });
    },
  });
  app.use('/api/', limiter);

  // 7. API routes under /api/v1
  app.use('/api/v1', apiRoutes);

  // Health check (outside versioned API for load balancers/uptime probes)
  app.get('/health', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
  });

  // 8. Swagger docs (OpenAPI source: src/docs/openapi.yaml)
  setupSwagger(app);

  // 9. JSON 404 handler
  app.use(notFound);

  // 10. Centralized error handler (see src/middleware/errorHandler.js)
  app.use(errorHandler);

  return app;
}
