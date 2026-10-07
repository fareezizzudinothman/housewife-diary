import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import apiRouter from './routes/index.js';
import { parseCookies } from './middleware/cookies.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(currentDir, '../..');
const publicDir = path.join(appRoot, 'public');
const clientDir = path.join(appRoot, 'src', 'client');
const sharedDir = path.join(appRoot, 'src', 'shared');

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use(parseCookies);

  // API: double-submit CSRF protection for unsafe methods, then module routers.
  app.use('/api', csrfProtection);
  app.use('/api', apiRouter);

  // The shared contracts directory (error codes, role helpers) is served so
  // the vanilla-JS client can import the same constants the server uses.
  app.use('/shared', express.static(sharedDir));
  app.use(express.static(publicDir));
  app.use(express.static(clientDir));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
