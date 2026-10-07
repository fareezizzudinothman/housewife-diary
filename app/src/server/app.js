import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(currentDir, '../..');
const publicDir = path.join(appRoot, 'public');
const clientDir = path.join(appRoot, 'src', 'client');

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));

  app.use('/api', apiRouter);
  app.use(express.static(publicDir));
  app.use(express.static(clientDir));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
