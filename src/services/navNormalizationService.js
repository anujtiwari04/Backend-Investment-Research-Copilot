// src/services/navNormalizationService.js
//
// Pure normalization logic: converts a raw MFapi JSON response into a clean
// array of NAV records ready for database insertion or further processing.
//
// Deliberately has NO side-effects — no network calls, no DB writes, no logging.
// This makes it trivially testable and safely reusable by any part of the app.

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a raw MFapi response into a validated array of NAV records.
 *
 * Each output record has the shape:
 *   { schemeCode: number, date: "YYYY-MM-DD", nav: number }
 *
 * Rules applied to every entry in rawResponse.data:
 *   - date must match DD-MM-YYYY and represent a real calendar date
 *     (e.g. "31-02-2026" is rejected because 31 Feb does not exist)
 *   - nav must parse to a finite JavaScript number greater than zero
 *   - invalid records are collected in a `rejected` array (not thrown away silently)
 *
 * The original rawResponse object is never mutated.
 *
 * @param {object} rawResponse  - Full MFapi JSON: { meta: {...}, data: [...] }
 * @returns {{ schemeCode: number, records: Array<{schemeCode:number, date:string, nav:number}>, rejected: Array<{entry:object, reason:string}> }}
 * @throws {Error}  if the top-level structure is missing required fields
 */
export function normalizeNavData(rawResponse) {
  // ── 1. Top-level validation ─────────────────────────────────────────────
  if (rawResponse === null || typeof rawResponse !== 'object') {
    throw new Error('rawResponse must be a non-null object.');
  }

  const { meta, data } = rawResponse;

  if (!meta || typeof meta !== 'object') {
    throw new Error('rawResponse.meta is missing or not an object.');
  }

  // scheme_code may arrive as a number or numeric string from MFapi
  const rawSchemeCode = meta.scheme_code;
  if (rawSchemeCode === undefined || rawSchemeCode === null || rawSchemeCode === '') {
    throw new Error('rawResponse.meta.scheme_code is missing.');
  }

  const schemeCode = Number(rawSchemeCode);
  if (!Number.isFinite(schemeCode) || schemeCode <= 0) {
    throw new Error(
      `rawResponse.meta.scheme_code is not a valid positive number (got: ${rawSchemeCode}).`
    );
  }

  if (!Array.isArray(data)) {
    throw new Error('rawResponse.data must be an array.');
  }

  // ── 2. Per-record normalization ─────────────────────────────────────────
  const records  = [];
  const rejected = [];

  for (const entry of data) {
    // --- Date conversion: DD-MM-YYYY → YYYY-MM-DD ---

    const dateResult = parseDDMMYYYY(entry.date);
    if (!dateResult.ok) {
      rejected.push({ entry, reason: dateResult.error });
      continue;
    }

    // --- NAV conversion: string → number ---

    const navResult = parseNav(entry.nav);
    if (!navResult.ok) {
      rejected.push({ entry, reason: navResult.error });
      continue;
    }

    // Record is valid — push an entirely new object (no mutation of entry)
    records.push({
      schemeCode,
      date: dateResult.value,   // "YYYY-MM-DD" string
      nav:  navResult.value,    // JavaScript number
    });
  }

  return { schemeCode, records, rejected };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Parse a date string in "DD-MM-YYYY" format into "YYYY-MM-DD".
 *
 * Returns a discriminated-union result object so the caller decides what to do
 * with failures — no exceptions are thrown from this helper.
 *
 * Rejection reasons:
 *   - missing or non-string input
 *   - wrong number of segments after splitting on "-"
 *   - any segment is not an integer
 *   - out-of-range values (month 0, day 0, year < 1900, etc.)
 *   - date rollover (e.g. "31-02-2026" → March 3 in JS, caught by re-check)
 *
 * Dates are kept as plain "YYYY-MM-DD" strings throughout to avoid any
 * timezone-induced date shifts. The caller (DB layer) is responsible for
 * converting to a Date object when needed.
 *
 * @param {*}  raw
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function parseDDMMYYYY(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: `date is missing or not a string (got: ${JSON.stringify(raw)})` };
  }

  const parts = raw.trim().split('-');
  if (parts.length !== 3) {
    return { ok: false, error: `date "${raw}" does not match DD-MM-YYYY format` };
  }

  const [ddStr, mmStr, yyyyStr] = parts;

  const dd   = Number(ddStr);
  const mm   = Number(mmStr);
  const yyyy = Number(yyyyStr);

  if (!Number.isInteger(dd) || !Number.isInteger(mm) || !Number.isInteger(yyyy)) {
    return { ok: false, error: `date "${raw}" contains non-integer segments` };
  }

  // Coarse range checks
  if (yyyy < 1900 || yyyy > 2200) {
    return { ok: false, error: `date "${raw}" has an out-of-range year (${yyyy})` };
  }
  if (mm < 1 || mm > 12) {
    return { ok: false, error: `date "${raw}" has an out-of-range month (${mm})` };
  }
  if (dd < 1 || dd > 31) {
    return { ok: false, error: `date "${raw}" has an out-of-range day (${dd})` };
  }

  // Fine-grained rollover check: construct the date purely from UTC parts,
  // then verify the components survive the round-trip.
  // Using Date.UTC avoids local-timezone interpretation entirely.
  const utcMs = Date.UTC(yyyy, mm - 1, dd); // month is 0-indexed in Date.UTC
  const probe  = new Date(utcMs);

  if (
    probe.getUTCFullYear() !== yyyy ||
    probe.getUTCMonth() + 1 !== mm  ||  // getUTCMonth() is 0-indexed
    probe.getUTCDate()  !== dd
  ) {
    return {
      ok: false,
      error: `date "${raw}" is not a real calendar date (e.g. 31-Feb or 30-Feb)`,
    };
  }

  // Zero-pad to ensure consistent "YYYY-MM-DD" output
  const yyyy4 = String(yyyy).padStart(4, '0');
  const mm2   = String(mm).padStart(2, '0');
  const dd2   = String(dd).padStart(2, '0');

  return { ok: true, value: `${yyyy4}-${mm2}-${dd2}` };
}

/**
 * Parse a NAV value (typically a string from the API) into a finite number > 0.
 *
 * @param {*} raw
 * @returns {{ ok: true, value: number } | { ok: false, error: string }}
 */
function parseNav(raw) {
  if (raw === undefined || raw === null) {
    return { ok: false, error: `nav is missing (got: ${JSON.stringify(raw)})` };
  }

  // Number('') === 0 in JavaScript, which would pass the finite check and then
  // be caught by the > 0 guard — but with a confusing message. Catch it early.
  if (typeof raw === 'string' && raw.trim() === '') {
    return { ok: false, error: `nav "" is not a finite number` };
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return { ok: false, error: `nav "${raw}" is not a finite number` };
  }

  if (value <= 0) {
    return { ok: false, error: `nav "${raw}" must be greater than zero (got: ${value})` };
  }

  return { ok: true, value };
}
