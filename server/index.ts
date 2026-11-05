import { app } from './app.js';

const server = app.listen(3001, '127.0.0.1', () => {
  console.log('GLStudio compiler listening on http://127.0.0.1:3001');
  console.log('Trusted local developer mode — do not expose this native compiler to a network.');
});
server.requestTimeout = 130_000;
server.headersTimeout = 10_000;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    // Closing sockets triggers the compilation route's cancellation handler.
    server.closeAllConnections();
    server.close(() => { process.exitCode = 0; });
  });
}
