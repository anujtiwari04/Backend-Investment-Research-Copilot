// src/routes/funds.js
// Registers all /api/funds routes and maps them to controller functions.
//
// Route order matters:
//   /sync/:schemeCode must be defined BEFORE /:schemeCode
//   so that the literal "sync" segment is not mistakenly captured
//   as a schemeCode value.

import { Router } from 'express';
import {
  listFunds,
  getFund,
  syncFund,
  getNavHistory,
} from '../controllers/fundController.js';

const router = Router();

// GET  /api/funds                      — List all synced funds (paginated)
router.get('/', listFunds);

// POST /api/funds/sync/:schemeCode     — Sync a fund from MFapi
router.post('/sync/:schemeCode', syncFund);

// GET  /api/funds/:schemeCode          — Get fund metadata
router.get('/:schemeCode', getFund);

// GET  /api/funds/:schemeCode/nav      — Get NAV history (paginated, filterable)
router.get('/:schemeCode/nav', getNavHistory);

export default router;
