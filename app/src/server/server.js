import { config } from './config/config.js';
import { createApp } from './app.js';
import { prisma } from './utils/prisma.js';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Housewife Diary listening on http://localhost:${config.port} [${config.env}]`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully…`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
