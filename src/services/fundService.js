// src/services/fundService.js
// Business logic for fund metadata and NAV history operations.
// Controllers call this layer; this layer talks to Mongoose models.

import Fund from '../models/Fund.js';
import NavHistory from '../models/NavHistory.js';
import { fetchFundFromMFApi } from './mfApiService.js';

// ---------------------------------------------------------------------------
// Fund metadata operations
// ---------------------------------------------------------------------------

/**
 * Return a paginated list of all synced funds.
 *
 * @param {number} page   - 1-indexed page number
 * @param {number} limit  - Records per page
 * @returns {Promise<{ funds: Fund[], total: number }>}
 */
export async function listFunds(page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [funds, total] = await Promise.all([
    Fund.find({})
      .select('-__v')
      .sort({ schemeName: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Fund.countDocuments({}),
  ]);

  return { funds, total };
}

/**
 * Return a single fund by its schemeCode.
 * Returns null if not found — let the controller decide the HTTP response.
 *
 * @param {number} schemeCode
 * @returns {Promise<Fund|null>}
 */
export async function getFundBySchemeCode(schemeCode) {
  return Fund.findOne({ schemeCode }).select('-__v').lean();
}

// ---------------------------------------------------------------------------
// Sync (fetch from MFapi and persist)
// ---------------------------------------------------------------------------

/**
 * Sync a fund's metadata and NAV history from MFapi into MongoDB.
 *
 * - Upserts the Fund document (create or update metadata).
 * - Bulk-upserts NAV records using the compound unique index so repeated
 *   syncs are idempotent and never create duplicates.
 *
 * @param {number|string} schemeCode
 * @returns {Promise<{ fund: Fund, navInserted: number, navTotal: number }>}
 */
export async function syncFund(schemeCode) {
  const code = Number(schemeCode);

  // 1. Fetch from external API (throws on failure)
  const { meta, navData } = await fetchFundFromMFApi(code);

  // 2. Upsert fund metadata
  const fund = await Fund.findOneAndUpdate(
    { schemeCode: code },
    {
      ...meta,
      lastSyncedAt: new Date(),
    },
    {
      upsert: true,
      new: true,      // return the updated document
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  // 3. Bulk-upsert NAV records
  let navInserted = 0;
  if (navData.length > 0) {
    const bulkOps = navData.map((record) => ({
      updateOne: {
        filter: { schemeCode: code, date: record.date },
        update: { $set: { nav: record.nav } },
        upsert: true,
      },
    }));

    // bulkWrite is the most efficient way to upsert many documents at once
    const result = await NavHistory.bulkWrite(bulkOps, { ordered: false });
    navInserted = result.upsertedCount;
  }

  const navTotal = await NavHistory.countDocuments({ schemeCode: code });

  return { fund, navInserted, navTotal };
}

// ---------------------------------------------------------------------------
// NAV history query
// ---------------------------------------------------------------------------

/**
 * Return paginated NAV history for a fund, with optional date range filters.
 *
 * @param {number} schemeCode
 * @param {object} options
 * @param {Date|null}   options.from  - Start date (inclusive)
 * @param {Date|null}   options.to    - End date (inclusive)
 * @param {number}      options.page  - 1-indexed page
 * @param {number}      options.limit - Records per page
 * @returns {Promise<{ records: NavHistory[], total: number }>}
 */
export async function getNavHistory(schemeCode, { from, to, page = 1, limit = 100 }) {
  const query = { schemeCode: Number(schemeCode) };

  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  const skip = (page - 1) * limit;

  const [records, total] = await Promise.all([
    NavHistory.find(query)
      .select('-_id schemeCode date nav')
      .sort({ date: -1 }) // most recent first
      .skip(skip)
      .limit(limit)
      .lean(),
    NavHistory.countDocuments(query),
  ]);

  return { records, total };
}
