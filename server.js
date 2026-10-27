import { createServer } from './app.js';

const port = Number(process.env.PORT ?? 8080);
const host = '0.0.0.0';

const server = createServer();

server.listen(port, host, () => {
  console.log(`e2e-hello listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`received ${signal}, shutting down`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
