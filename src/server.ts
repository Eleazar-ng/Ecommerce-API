import type { Server } from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';

let server: Server | undefined;

async function start(): Promise<void> {
  await connectDB();

  server = app.listen(env.PORT, () => {
    console.log(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  });
}

// --- Graceful shutdown skeleton ---
// Intentionally minimal for now — Stage 11 decides what "graceful" means for THIS app
// specifically (e.g. an in-flight Stripe webhook mid-shutdown).
async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  if (!server) {
    process.exit(0);
    return;
  }

  // server.close() stops accepting NEW connections but, by default, waits for ALL open
  // sockets to end — including idle keep-alive connections that aren't actively processing
  // a request. Those can sit open for a long time (up to the keep-alive timeout), which
  // would otherwise stall shutdown for no good reason. closeIdleConnections() (Node 18.2+)
  // proactively closes those immediately, while leaving connections that ARE actively
  // processing a request (e.g. a webhook mid-flight) alone to finish normally.
  server.closeIdleConnections();

  server.close(async () => {
    console.log('HTTP server closed');
    await disconnectDB();
    process.exit(0);
  });


  // Force-exit if shutdown hangs longer than 10s
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    // closeAllConnections() (Node 18.2+) forcibly ends any connections still open,
    // including ones mid-request, so the process can actually exit rather than hang
    // waiting on a socket that server.close()'s callback is still watching.
    server?.closeAllConnections();
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});