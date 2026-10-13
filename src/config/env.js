import dotenv from 'dotenv';

dotenv.config();

const requiredVars = ['MONGODB_URI', 'JWT_SECRET'];

function getEnv(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  return typeof value === 'string' ? value.trim() : value;
}

export const env = {
  nodeEnv: getEnv('NODE_ENV', 'development'),
  port: Number(getEnv('PORT', '5000')),
  mongodbUri: getEnv('MONGODB_URI'),
  jwtSecret: getEnv('JWT_SECRET'),
  jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '15m'),
  bcryptRounds: Number(getEnv('BCRYPT_ROUNDS', '12')),
  logLevel: getEnv('LOG_LEVEL', 'info'),
  corsOrigin: getEnv('CORS_ORIGIN', 'http://localhost:3000'),
  rateLimitWindowMs: Number(getEnv('RATE_LIMIT_WINDOW_MS', '900000')),
  rateLimitMax: Number(getEnv('RATE_LIMIT_MAX', '100')),
};

export function validateEnv() {
  const missing = requiredVars.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and set values.`,
    );
  }

  if (Number.isNaN(env.port) || env.port <= 0) {
    throw new Error('Invalid PORT: must be a positive number.');
  }

  if (Number.isNaN(env.bcryptRounds) || env.bcryptRounds < 4) {
    throw new Error('Invalid BCRYPT_ROUNDS: must be a number >= 4.');
  }

  if (env.jwtSecret.length < 32) {
    throw new Error('Invalid JWT_SECRET: must be at least 32 characters long.');
  }
}
