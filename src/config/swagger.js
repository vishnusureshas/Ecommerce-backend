import { readFileSync } from 'node:fs';
import yaml from 'yaml';
import swaggerUi from 'swagger-ui-express';

let cachedDocument = null;

/** Load and parse the OpenAPI source (fail fast if docs are missing/invalid). */
export function loadOpenApiDocument() {
  if (!cachedDocument) {
    const url = new URL('../docs/openapi.yaml', import.meta.url);
    cachedDocument = yaml.parse(readFileSync(url, 'utf8'));
  }
  return cachedDocument;
}

/** Serve Swagger UI at /api-docs. Mounted before the 404 handler. */
export function setupSwagger(app) {
  const document = loadOpenApiDocument();
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(document, { customSiteTitle: 'E-commerce API docs' }));
}
