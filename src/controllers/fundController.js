// src/controllers/fundController.js
// Request handlers for all /api/funds routes.
// Each handler validates inputs, delegates to fundService, and formats the response.
// Errors are forwarded to the central error handler via next(err).

import * as fundService from '../services/fundService.js';
import { sendSuccess, sendError, buildPagination } from '../utils/response.js';
import { parseISODate } from '../utils/dateParser.js';

// ---------------------------------------------------------------------------
// GET /api/funds
// ---------------------------------------------------------------------------

/**
 * List all synced funds with pagination.
 * Query params: page (default 1), limit (default 20, max 100)
 */
export async function listFunds(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const { funds, total } = await fundService.listFunds(page, limit);

    return sendSuccess(res, {
      funds,
      pagination: buildPagination(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/funds/:schemeCode
// ---------------------------------------------------------------------------

/**
 * Get a single fund's metadata by schemeCode.
 */
export async function getFund(req, res, next) {
  try {
    const schemeCode = parseSchemeCode(req.params.schemeCode);
    if (!schemeCode) {
      return sendError(res, 'schemeCode must be a positive integer.', 400, 'INVALID_SCHEME_CODE');
    }

    const fund = await fundService.getFundBySchemeCode(schemeCode);
    if (!fund) {
      return sendError(
        res,
        `Fund with scheme code ${schemeCode} has not been synced yet. Use POST /api/funds/sync/${schemeCode} first.`,
        404,
        'FUND_NOT_FOUND'
      );
    }

    return sendSuccess(res, { fund });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/funds/sync/:schemeCode
// ---------------------------------------------------------------------------

/**
 * Sync a fund from MFapi into the local database.
 * Safe to call multiple times — repeated syncs are idempotent.
 */
export async function syncFund(req, res, next) {
  try {
    const schemeCode = parseSchemeCode(req.params.schemeCode);
    if (!schemeCode) {
      return sendError(res, 'schemeCode must be a positive integer.', 400, 'INVALID_SCHEME_CODE');
    }

    console.log(`[Sync] Starting sync for scheme ${schemeCode}…`);
    const { fund, navInserted, navTotal } = await fundService.syncFund(schemeCode);
    console.log(`[Sync] Done. Inserted ${navInserted} new NAV records. Total: ${navTotal}.`);

    return sendSuccess(
      res,
      {
        fund,
        sync: {
          navInserted,
          navTotal,
          syncedAt: fund.lastSyncedAt,
        },
      },
      `Fund "${fund.schemeName}" synced successfully.`,
      200
    );
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/funds/:schemeCode/nav
// ---------------------------------------------------------------------------

/**
 * Return paginated NAV history for a fund.
 * Query params: from, to (YYYY-MM-DD), page (default 1), limit (default 100, max 500)
 */
export async function getNavHistory(req, res, next) {
  try {
    const schemeCode = parseSchemeCode(req.params.schemeCode);
    if (!schemeCode) {
      return sendError(res, 'schemeCode must be a positive integer.', 400, 'INVALID_SCHEME_CODE');
    }

    // Validate date filters
    const from = parseISODate(req.query.from) || null;
    const to = parseISODate(req.query.to) || null;

    if (req.query.from && !from) {
      return sendError(res, '"from" must be a valid date in YYYY-MM-DD format.', 400, 'INVALID_DATE');
    }
    if (req.query.to && !to) {
      return sendError(res, '"to" must be a valid date in YYYY-MM-DD format.', 400, 'INVALID_DATE');
    }
    if (from && to && from > to) {
      return sendError(res, '"from" must not be after "to".', 400, 'INVALID_DATE_RANGE');
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));

    // Check the fund exists
    const fund = await fundService.getFundBySchemeCode(schemeCode);
    if (!fund) {
      return sendError(
        res,
        `Fund with scheme code ${schemeCode} has not been synced yet. Use POST /api/funds/sync/${schemeCode} first.`,
        404,
        'FUND_NOT_FOUND'
      );
    }

    const { records, total } = await fundService.getNavHistory(schemeCode, { from, to, page, limit });

    return sendSuccess(res, {
      schemeCode,
      schemeName: fund.schemeName,
      navHistory: records,
      pagination: buildPagination(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Parse and validate a schemeCode URL parameter.
 * Returns the numeric value, or null if invalid.
 *
 * @param {string} raw
 * @returns {number|null}
 */
function parseSchemeCode(raw) {
  const code = parseInt(raw, 10);
  if (isNaN(code) || code <= 0) return null;
  return code;
}
