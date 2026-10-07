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

export function loadConfig(env = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Copy app/.env.example to app/.env and provide a PostgreSQL connection URL.',
    );
  }
  return {
    env: env.NODE_ENV?.trim() || 'development',
    port: parsePort(env.PORT),
    databaseUrl,
    sessionSecret: env.SESSION_SECRET?.trim() || null,
  };
}

export const config = loadConfig();
