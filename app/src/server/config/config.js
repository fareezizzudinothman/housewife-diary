import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(currentDir, '../../..');

// Loads app/.env for local development. Never overrides variables that the
// environment already provides (e.g. DATABASE_URL set by Docker Compose).
dotenv.config({ path: path.join(appRoot, '.env') });

function parsePort(value) {
  if (value === undefined || value === '') {
    return 3000;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function parseBcryptCost(value, nodeEnv) {
  if (value === undefined || value === '') {
    return 12;
  }
  const cost = Number(value);
  if (!Number.isInteger(cost) || cost < 4 || cost > 15) {
    throw new Error('BCRYPT_COST must be an integer between 4 and 15.');
  }
  if (nodeEnv === 'production' && cost < 10) {
    throw new Error('BCRYPT_COST must be at least 10 in production.');
  }
  return cost;
}

export function loadConfig(env = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Copy app/.env.example to app/.env and provide a PostgreSQL connection URL.',
    );
  }
  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  const sessionSecret = env.SESSION_SECRET?.trim() || null;
  if (nodeEnv === 'production' && !sessionSecret) {
    throw new Error(
      'SESSION_SECRET is required in production. Generate one with: openssl rand -base64 48',
    );
  }
  return {
    env: nodeEnv,
    port: parsePort(env.PORT),
    databaseUrl,
    sessionSecret,
    bcryptCost: parseBcryptCost(env.BCRYPT_COST, nodeEnv),
  };
}

export const config = loadConfig();
