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

  if (server) {
    server.close(async () => {
      console.log('HTTP server closed');
      await disconnectDB();
      process.exit(0);
    });
  } else {
    process.exit(0);
  }

  // Force-exit if shutdown hangs longer than 10s
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
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