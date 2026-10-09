// src/app.js
// Creates and configures the Express application.
// This file does NOT start the server — that is done in server.js.
// Separating app from server makes the app easier to test in isolation.

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import healthRouter from './routes/health.js';
import fundsRouter from './routes/funds.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';

const app = express();

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------

// Helmet sets a sensible collection of HTTP security headers
app.use(helmet());

// CORS — allow only origins listed in CORS_ORIGIN (comma-separated).
// Falls back to allowing all origins in development when not set.
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : '*';

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

// Parse JSON bodies; limit size to 1 MB to avoid large payload attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---------------------------------------------------------------------------
// Request logging
// ---------------------------------------------------------------------------

// Use 'dev' format in development (colorised), 'combined' in production
const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(logFormat));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/health', healthRouter);
app.use('/api/funds', fundsRouter);

// Root route — useful for quick sanity checks
app.get('/', (req, res) => {
  res.json({
    name: 'Investment Research Copilot API',
    version: '1.0.0',
    docs: '/api/health',
  });
});

// ---------------------------------------------------------------------------
// Error handling (must come last)
// ---------------------------------------------------------------------------

app.use(notFound);
app.use(errorHandler);

export default app;
