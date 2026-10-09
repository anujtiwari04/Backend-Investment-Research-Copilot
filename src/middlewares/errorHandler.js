// src/middlewares/errorHandler.js
// Central error-handling middleware for Express.
// Catches any error passed via next(err) and returns a clean JSON response.
// Stack traces are only logged to the console — never sent to the client.

import { sendError } from '../utils/response.js';

/**
 * 404 Not-Found middleware.
 * Mounted after all routes to catch requests to unknown paths.
 */
export function notFound(req, res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
}

/**
 * Global error handler.
 * Must have exactly 4 parameters so Express recognises it as an error handler.
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next  // eslint-disable-line no-unused-vars
 */
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Always log the full error on the server
  console.error(`[ERROR] ${req.method} ${req.originalUrl} —`, err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  // Mongoose validation errors → 422
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
    return sendError(res, message, 422, 'VALIDATION_ERROR');
  }

  // Mongoose duplicate key errors → 409
  if (err.code === 11000) {
    return sendError(
      res,
      'A record with this key already exists.',
      409,
      'DUPLICATE_KEY'
    );
  }

  // Mongoose CastError (e.g. invalid ObjectId) → 400
  if (err.name === 'CastError') {
    return sendError(res, `Invalid value for field: ${err.path}`, 400, 'CAST_ERROR');
  }

  // Any explicitly set statusCode (thrown by our own code)
  const statusCode = err.statusCode || 500;
  const message =
    statusCode < 500
      ? err.message
      : 'An unexpected error occurred. Please try again later.';

  return sendError(res, message, statusCode, err.code || undefined);
}
