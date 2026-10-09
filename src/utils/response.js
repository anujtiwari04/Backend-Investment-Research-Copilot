// src/utils/response.js
// Centralised helpers for sending consistent JSON responses.
// Every success and error response from the API uses these helpers
// so the shape is always predictable for frontend consumers.

/**
 * Send a successful JSON response.
 *
 * Shape:
 * {
 *   "success": true,
 *   "data": <payload>,
 *   "message": <optional string>   // omitted when not provided
 * }
 *
 * @param {import('express').Response} res
 * @param {*} data       - The payload to return
 * @param {string} [message] - Optional human-readable message
 * @param {number} [statusCode=200] - HTTP status code
 */
export function sendSuccess(res, data, message, statusCode = 200) {
  const body = { success: true, data };
  if (message) body.message = message;
  return res.status(statusCode).json(body);
}

/**
 * Send an error JSON response.
 *
 * Shape:
 * {
 *   "success": false,
 *   "error": {
 *     "message": <string>,
 *     "code": <optional string>   // machine-readable error code
 *   }
 * }
 *
 * Stack traces and internal details are NEVER included.
 *
 * @param {import('express').Response} res
 * @param {string} message   - Human-readable error message
 * @param {number} [statusCode=500] - HTTP status code
 * @param {string} [code]    - Optional machine-readable error code
 */
export function sendError(res, message, statusCode = 500, code) {
  const body = { success: false, error: { message } };
  if (code) body.error.code = code;
  return res.status(statusCode).json(body);
}

/**
 * Build a pagination meta object to include alongside list responses.
 *
 * @param {number} total  - Total number of matching records in the DB
 * @param {number} page   - Current page (1-indexed)
 * @param {number} limit  - Records per page
 * @returns {{ total: number, page: number, limit: number, totalPages: number }}
 */
export function buildPagination(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
