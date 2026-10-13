import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../logger/logger.js';

export async function connectDatabase() {
  try {
    await mongoose.connect(env.mongodbUri);
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error({ err }, 'MongoDB connection failed');
    process.exit(1);
  }
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
