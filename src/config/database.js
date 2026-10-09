// src/config/database.js
// Manages the Mongoose connection lifecycle.
// Connection is established once at startup; failures are logged and the
// process exits so a process manager (e.g. PM2) can restart it cleanly.

import mongoose from 'mongoose';

/**
 * Connect to MongoDB using the URI from environment variables.
 * Exits the process if the initial connection fails.
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('[DB] MONGODB_URI is not set. Check your .env file.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      // Recommended settings to avoid deprecation warnings
      serverSelectionTimeoutMS: 5000, // Fail fast if MongoDB is unreachable
    });

    console.log(`[DB] Connected to MongoDB: ${mongoose.connection.host}`);

    // Log connection events after initial connect
    mongoose.connection.on('disconnected', () => {
      console.warn('[DB] MongoDB disconnected.');
    });

    mongoose.connection.on('reconnected', () => {
      console.info('[DB] MongoDB reconnected.');
    });

    mongoose.connection.on('error', (err) => {
      console.error('[DB] MongoDB connection error:', err.message);
    });
  } catch (err) {
    console.error('[DB] Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
}

/**
 * Returns the current Mongoose connection state as a readable string.
 * Used by the health endpoint.
 */
export function getConnectionState() {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] || 'unknown';
}
