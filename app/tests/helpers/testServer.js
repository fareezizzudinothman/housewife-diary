import { createApp } from '../../src/server/app.js';

export async function startTestServer() {
  const server = await new Promise((resolve) => {
    const created = createApp().listen(0, '127.0.0.1', () => resolve(created));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    server,
    baseUrl,
    async stop() {
      // Force-close keep-alive sockets so close() resolves promptly.
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
