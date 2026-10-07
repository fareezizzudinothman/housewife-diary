import { PrismaClient } from '@prisma/client';
import { config } from '../config/config.js';

// Importing config first guarantees app/.env is loaded before the client
// resolves DATABASE_URL.
export const prisma = new PrismaClient({
  log: config.env === 'development' ? ['warn', 'error'] : ['error'],
});
