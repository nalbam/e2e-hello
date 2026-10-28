import { createServer } from './app.js';
import { createStoreFromEnv } from './store.js';

const port = Number(process.env.PORT ?? 8080);
const host = '0.0.0.0';

const store = createStoreFromEnv();
const server = createServer({ store });

server.listen(port, host, () => {
  console.log(`e2e-hello listening on http://${host}:${port} (storage: ${store.kind})`);
});

store.init();

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`received ${signal}, shutting down`);
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  server.close(async () => {
    try {
      await store.close();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
