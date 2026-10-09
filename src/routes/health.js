// src/routes/health.js
// Registers the health-check endpoint.

import { Router } from 'express';
import { getHealth } from '../controllers/healthController.js';

const router = Router();

// GET /api/health
router.get('/', getHealth);

export default router;
