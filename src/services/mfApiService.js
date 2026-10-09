// src/services/mfApiService.js
// Responsible for all outbound HTTP calls to api.mfapi.in.
// Controllers never call external APIs directly — they use this service.

import { parseMFApiDate } from '../utils/dateParser.js';

const BASE_URL = process.env.MFAPI_BASE_URL || 'https://api.mfapi.in/mf';
const TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10);

/**
 * Fetch fund metadata and full NAV history for a given schemeCode.
 *
 * @param {number|string} schemeCode
 * @returns {Promise<{ meta: object, navData: Array<{date: Date, nav: number}> }>}
 * @throws {Error} with a descriptive message on network/parse failures
 */
export async function fetchFundFromMFApi(schemeCode) {
  const url = `${BASE_URL}/${schemeCode}`;

  // Use AbortController to enforce a request timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw Object.assign(
        new Error(`MFapi request timed out after ${TIMEOUT_MS}ms.`),
        { statusCode: 504, code: 'MFAPI_TIMEOUT' }
      );
    }
    throw Object.assign(
      new Error(`Failed to reach MFapi: ${err.message}`),
      { statusCode: 502, code: 'MFAPI_UNREACHABLE' }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw Object.assign(
        new Error(`Scheme code ${schemeCode} not found on MFapi.`),
        { statusCode: 404, code: 'SCHEME_NOT_FOUND' }
      );
    }
    throw Object.assign(
      new Error(`MFapi returned HTTP ${response.status}.`),
      { statusCode: 502, code: 'MFAPI_ERROR' }
    );
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw Object.assign(
      new Error('MFapi returned an invalid JSON response.'),
      { statusCode: 502, code: 'MFAPI_INVALID_RESPONSE' }
    );
  }

  // Validate top-level structure
  if (!json || typeof json !== 'object' || !json.meta) {
    throw Object.assign(
      new Error('MFapi response is missing the expected "meta" field.'),
      { statusCode: 502, code: 'MFAPI_INVALID_RESPONSE' }
    );
  }

  // MFapi returns HTTP 200 with scheme_code=0 and blank fields for unknown schemes
  // (it never sends a 404). Detect and convert this to a proper not-found error.
  const returnedCode = Number(json.meta.scheme_code);
  const returnedName = (json.meta.scheme_name || '').trim();
  if (returnedCode === 0 || returnedName === '') {
    throw Object.assign(
      new Error(`Scheme code ${schemeCode} was not found on MFapi.`),
      { statusCode: 404, code: 'SCHEME_NOT_FOUND' }
    );
  }

  // Normalise metadata
  const meta = normaliseMeta(json.meta, schemeCode);

  // Normalise NAV history
  const rawNavData = Array.isArray(json.data) ? json.data : [];
  const navData = normaliseNavHistory(rawNavData, schemeCode);

  return { meta, navData };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Map MFapi's meta object to our internal shape.
 * Falls back to empty strings for optional fields that may be absent.
 */
function normaliseMeta(meta, schemeCode) {
  return {
    schemeCode: Number(meta.scheme_code || schemeCode),
    schemeName: (meta.scheme_name || '').trim(),
    fundHouse: (meta.fund_house || '').trim(),
    schemeType: (meta.scheme_type || '').trim(),
    schemeCategory: (meta.scheme_category || '').trim(),
    isinGrowth: (meta.isin_growth || '').trim(),
    isinDivReinvestment: (meta.isin_div_reinvestment || '').trim(),
  };
}

/**
 * Parse and validate the raw NAV array from MFapi.
 * Records with unparseable dates or non-numeric NAVs are silently skipped
 * so one bad record does not abort the whole sync.
 *
 * @param {Array} rawNavData
 * @param {number|string} schemeCode - used only for logging
 * @returns {Array<{date: Date, nav: number}>}
 */
function normaliseNavHistory(rawNavData, schemeCode) {
  let skipped = 0;
  const result = [];

  for (const record of rawNavData) {
    const date = parseMFApiDate(record.date);
    const nav = parseFloat(record.nav);

    if (!date || isNaN(nav) || nav < 0) {
      skipped++;
      continue;
    }

    result.push({ date, nav });
  }

  if (skipped > 0) {
    console.warn(
      `[MFapi] Skipped ${skipped} malformed NAV record(s) for scheme ${schemeCode}.`
    );
  }

  return result;
}
