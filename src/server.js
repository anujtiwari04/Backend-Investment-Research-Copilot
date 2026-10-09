// src/server.js
// Entry point — loads environment variables, connects to MongoDB, then starts
// the HTTP server. Handles unhandled rejections and signals for a graceful shutdown.

import 'dotenv/config'; // Must be the very first import so env vars are available everywhere
import app from './app.js';
import { connectDB } from './config/database.js';

// ---------------------------------------------------------------------------
// Validate required environment variables before doing anything else
// ---------------------------------------------------------------------------
const REQUIRED_ENV = ['MONGODB_URI'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[Server] Missing required environment variables: ${missing.join(', ')}`);
  console.error('[Server] Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '5000', 10);

// ---------------------------------------------------------------------------
// Start sequence
// ---------------------------------------------------------------------------
async function start() {
  // 1. Connect to MongoDB (exits on failure)
  await connectDB();

  // 2. Start the HTTP server
  const server = app.listen(PORT, () => {
    console.log(`[Server] Running in ${process.env.NODE_ENV || 'development'} mode`);
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
  });

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------------
  function shutdown(signal) {
    console.log(`\n[Server] Received ${signal}. Shutting down gracefully…`);
    server.close(() => {
      console.log('[Server] HTTP server closed.');
      process.exit(0);
    });

    // Force-exit after 10 seconds if something is hanging
    setTimeout(() => {
      console.error('[Server] Forced exit after timeout.');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ---------------------------------------------------------------------------
// Safety nets
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Promise Rejection:', reason);
  // Don't crash in development; crash in production so a supervisor can restart
  if (process.env.NODE_ENV === 'production') process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
  process.exit(1);
});

start();
