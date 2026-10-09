// src/controllers/healthController.js
// Handles GET /api/health
// Returns server status and the current MongoDB connection state.

import { getConnectionState } from '../config/database.js';
import { sendSuccess } from '../utils/response.js';

/**
 * GET /api/health
 * Returns:
 * {
 *   "success": true,
 *   "data": {
 *     "status": "ok",
 *     "database": "connected",
 *     "timestamp": "2024-01-01T00:00:00.000Z"
 *   }
 * }
 */
export function getHealth(req, res) {
  const dbState = getConnectionState();

  // If the database is not connected, return 503 to signal degraded state
  const isHealthy = dbState === 'connected';

  return res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    data: {
      status: isHealthy ? 'ok' : 'degraded',
      database: dbState,
      timestamp: new Date().toISOString(),
    },
  });
}
