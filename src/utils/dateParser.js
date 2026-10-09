// src/utils/dateParser.js
// Utility for safely parsing MFapi date strings into UTC Date objects.
//
// MFapi returns NAV dates in "DD-MM-YYYY" format (e.g. "31-12-2023").
// JavaScript's Date constructor does NOT reliably parse this format, so we
// split and construct the date manually, always anchoring to midnight UTC
// to avoid any timezone-induced date shifts.

/**
 * Parse a date string in "DD-MM-YYYY" format into a UTC midnight Date.
 *
 * Returns null for any input that is missing, not a string, or malformed.
 *
 * @param {string} ddmmyyyy - e.g. "31-12-2023"
 * @returns {Date|null}
 */
export function parseMFApiDate(ddmmyyyy) {
  if (!ddmmyyyy || typeof ddmmyyyy !== 'string') return null;

  const parts = ddmmyyyy.trim().split('-');
  if (parts.length !== 3) return null;

  const [dd, mm, yyyy] = parts;
  const day = parseInt(dd, 10);
  const month = parseInt(mm, 10); // 1-indexed
  const year = parseInt(yyyy, 10);

  // Basic range checks
  if (
    isNaN(day) || isNaN(month) || isNaN(year) ||
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    year < 1990 || year > 2100
  ) {
    return null;
  }

  // Use Date.UTC to construct midnight UTC — avoids local-timezone shifts
  const date = new Date(Date.UTC(year, month - 1, day));

  // Verify the date didn't roll over (e.g. 31-02 becomes 02-03)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Parse a "YYYY-MM-DD" string (ISO-ish, from query params) into a UTC Date.
 * Returns null if the input is missing or malformed.
 *
 * @param {string} yyyymmdd - e.g. "2023-12-31"
 * @returns {Date|null}
 */
export function parseISODate(yyyymmdd) {
  if (!yyyymmdd || typeof yyyymmdd !== 'string') return null;

  // new Date('YYYY-MM-DD') is parsed as UTC by the spec — safe to use here
  const date = new Date(yyyymmdd);
  if (isNaN(date.getTime())) return null;
  return date;
}
