import { AppError, ErrorCodes } from '../../shared/errors.js';
import { prisma } from '../utils/prisma.js';
import { config } from '../config/config.js';

export async function checkHealth(client = prisma) {
  try {
    await client.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new AppError('The database is currently unreachable.', {
      code: ErrorCodes.DATABASE_ERROR,
      status: 503,
      cause: error,
    });
  }
  return {
    status: 'ok',
    service: 'housewife-diary',
    environment: config.env,
    database: 'connected',
    timestamp: new Date().toISOString(),
  };
}
