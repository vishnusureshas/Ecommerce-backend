import { createApp } from './app.js';
import { env, validateEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { ensureIndexes } from './database/indexes.js';
import { logger } from './logger/logger.js';

validateEnv();

const app = createApp();
let server;

async function start() {
  await connectDatabase();
  await ensureIndexes();

  server = app.listen(env.port, () => {
    logger.info({ port: env.port, env: env.nodeEnv }, 'Server listening');
  });
}

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully');
  if (server) {
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Force exit if connections hang
    setTimeout(() => process.exit(1), 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();

export { app };
