// src/services/navNormalizationService.test.js
//
// Tests for normalizeNavData() using Node's built-in test runner (node:test).
// Run with:  node --test src/services/navNormalizationService.test.js
//
// No external test framework is required — node:test ships with Node ≥ 18.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeNavData } from './navNormalizationService.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** Minimal valid raw response that mirrors real MFapi shape */
const VALID_META = {
  fund_house:            'UTI Mutual Fund',
  scheme_type:           'Open Ended Schemes',
  scheme_category:       'Other Scheme - Index Funds',
  scheme_code:           120716,
  scheme_name:           'UTI Nifty 50 Index Fund - Direct Plan - Growth',
  isin_growth:           'INF789F01XA0',
  isin_div_reinvestment: null,
};

function makeRaw(dataOverride, metaOverride = {}) {
  return {
    meta: { ...VALID_META, ...metaOverride },
    data: dataOverride,
  };
}

// ---------------------------------------------------------------------------
// 1. Top-level structural validation
// ---------------------------------------------------------------------------

describe('normalizeNavData — structural validation', () => {

  it('throws when rawResponse is null', () => {
    assert.throws(
      () => normalizeNavData(null),
      { message: 'rawResponse must be a non-null object.' }
    );
  });

  it('throws when rawResponse is a primitive', () => {
    assert.throws(() => normalizeNavData(42));
    assert.throws(() => normalizeNavData('string'));
  });

  it('throws when meta is missing', () => {
    assert.throws(
      () => normalizeNavData({ data: [] }),
      { message: 'rawResponse.meta is missing or not an object.' }
    );
  });

  it('throws when meta.scheme_code is missing', () => {
    assert.throws(
      () => normalizeNavData({ meta: { scheme_type: 'x' }, data: [] }),
      { message: 'rawResponse.meta.scheme_code is missing.' }
    );
  });

  it('throws when meta.scheme_code is 0 (MFapi "not found" response)', () => {
    assert.throws(
      () => normalizeNavData(makeRaw([], { scheme_code: 0 })),
      /not a valid positive number/
    );
  });

  it('throws when data is not an array', () => {
    assert.throws(
      () => normalizeNavData({ meta: VALID_META, data: null }),
      { message: 'rawResponse.data must be an array.' }
    );
    assert.throws(
      () => normalizeNavData({ meta: VALID_META, data: 'oops' }),
      { message: 'rawResponse.data must be an array.' }
    );
  });

  it('accepts scheme_code as a numeric string', () => {
    const result = normalizeNavData(makeRaw([], { scheme_code: '120716' }));
    assert.equal(result.schemeCode, 120716);
  });

});

// ---------------------------------------------------------------------------
// 2. Empty data array
// ---------------------------------------------------------------------------

describe('normalizeNavData — empty data', () => {

  it('returns an empty records array and empty rejected array', () => {
    const result = normalizeNavData(makeRaw([]));
    assert.equal(result.schemeCode, 120716);
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.rejected, []);
  });

});

// ---------------------------------------------------------------------------
// 3. Valid records
// ---------------------------------------------------------------------------

describe('normalizeNavData — valid records', () => {

  it('converts a single valid entry correctly', () => {
    const raw = makeRaw([{ date: '08-10-2026', nav: '156.54450' }]);
    const { records, rejected } = normalizeNavData(raw);

    assert.equal(rejected.length, 0);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0], {
      schemeCode: 120716,
      date:       '2026-10-08',
      nav:        156.5445,
    });
  });

  it('converts multiple valid entries preserving order', () => {
    const raw = makeRaw([
      { date: '08-10-2026', nav: '156.54450' },
      { date: '07-10-2026', nav: '159.15930' },
      { date: '06-10-2026', nav: '160.37890' },
    ]);
    const { records } = normalizeNavData(raw);

    assert.equal(records.length, 3);
    assert.equal(records[0].date, '2026-10-08');
    assert.equal(records[1].date, '2026-10-07');
    assert.equal(records[2].date, '2026-10-06');
  });

  it('reads schemeCode from meta, not hardcoded', () => {
    const raw = makeRaw(
      [{ date: '01-01-2024', nav: '100' }],
      { scheme_code: 999888 }
    );
    const { records } = normalizeNavData(raw);
    assert.equal(records[0].schemeCode, 999888);
  });

  it('converts nav string with trailing zeros to a number', () => {
    const raw = makeRaw([{ date: '01-01-2024', nav: '100.50000' }]);
    const { records } = normalizeNavData(raw);
    assert.equal(records[0].nav, 100.5);
  });

  it('accepts nav when it is already a number (not a string)', () => {
    const raw = makeRaw([{ date: '01-01-2024', nav: 99.99 }]);
    const { records, rejected } = normalizeNavData(raw);
    assert.equal(rejected.length, 0);
    assert.equal(records[0].nav, 99.99);
  });

  it('zero-pads single-digit day and month in output', () => {
    const raw = makeRaw([{ date: '01-01-2024', nav: '50' }]);
    const { records } = normalizeNavData(raw);
    assert.equal(records[0].date, '2024-01-01');
  });

  it('does not mutate the original rawResponse object', () => {
    const entry = { date: '08-10-2026', nav: '156.54450' };
    const raw   = makeRaw([entry]);

    normalizeNavData(raw);

    // Original entry must be unchanged
    assert.equal(entry.date, '08-10-2026');
    assert.equal(entry.nav, '156.54450');
    // Original meta must be unchanged
    assert.equal(raw.meta.scheme_code, 120716);
  });

});

// ---------------------------------------------------------------------------
// 4. Invalid dates
// ---------------------------------------------------------------------------

describe('normalizeNavData — invalid dates', () => {

  function rejectReasonFor(dateStr) {
    const raw = makeRaw([{ date: dateStr, nav: '100' }]);
    const { records, rejected } = normalizeNavData(raw);
    assert.equal(records.length, 0, `expected record to be rejected for date "${dateStr}"`);
    assert.equal(rejected.length, 1);
    return rejected[0].reason;
  }

  it('rejects null date', () => {
    const raw = makeRaw([{ date: null, nav: '100' }]);
    const { records, rejected } = normalizeNavData(raw);
    assert.equal(records.length, 0);
    assert.match(rejected[0].reason, /missing or not a string/);
  });

  it('rejects undefined date', () => {
    const raw = makeRaw([{ nav: '100' }]); // date key absent
    const { records, rejected } = normalizeNavData(raw);
    assert.equal(records.length, 0);
    assert.match(rejected[0].reason, /missing or not a string/);
  });

  it('rejects empty string date', () => {
    const reason = rejectReasonFor('');
    assert.match(reason, /missing or not a string/);
  });

  it('rejects wrong separator (YYYY/MM/DD)', () => {
    const reason = rejectReasonFor('2026/10/08');
    assert.match(reason, /does not match DD-MM-YYYY/);
  });

  it('rejects ISO-format date (YYYY-MM-DD) — wrong field order', () => {
    // "2026-10-08" is parsed as DD-MM-YYYY, so DD="2026" → out-of-range year
    // (because we assign it to the dd variable and 2026 > 31)
    // The year check runs first when the parsed number exceeds 31.
    const reason = rejectReasonFor('2026-10-08');
    assert.match(reason, /out-of-range year/);
  });

  it('rejects 31-02-YYYY (Feb 31 does not exist)', () => {
    const reason = rejectReasonFor('31-02-2026');
    assert.match(reason, /not a real calendar date/);
  });

  it('rejects 29-02-2023 (2023 is not a leap year)', () => {
    const reason = rejectReasonFor('29-02-2023');
    assert.match(reason, /not a real calendar date/);
  });

  it('accepts 29-02-2024 (2024 IS a leap year)', () => {
    const raw = makeRaw([{ date: '29-02-2024', nav: '100' }]);
    const { records, rejected } = normalizeNavData(raw);
    assert.equal(rejected.length, 0);
    assert.equal(records[0].date, '2024-02-29');
  });

  it('rejects month 13', () => {
    const reason = rejectReasonFor('01-13-2024');
    assert.match(reason, /out-of-range month/);
  });

  it('rejects month 00', () => {
    const reason = rejectReasonFor('01-00-2024');
    assert.match(reason, /out-of-range month/);
  });

  it('rejects day 00', () => {
    const reason = rejectReasonFor('00-01-2024');
    assert.match(reason, /out-of-range day/);
  });

  it('rejects day 32', () => {
    const reason = rejectReasonFor('32-01-2024');
    assert.match(reason, /out-of-range day/);
  });

  it('rejects alphabetic date string', () => {
    // "not-a-date" has two hyphens, so it passes the 3-part format check,
    // then fails at the non-integer segment check (Number("not") is NaN).
    const reason = rejectReasonFor('not-a-date');
    assert.match(reason, /non-integer segments/);
  });

  it('rejects date with only two parts', () => {
    const reason = rejectReasonFor('08-10');
    assert.match(reason, /does not match DD-MM-YYYY/);
  });

});

// ---------------------------------------------------------------------------
// 5. Invalid NAV values
// ---------------------------------------------------------------------------

describe('normalizeNavData — invalid NAV values', () => {

  function rejectReasonForNav(navVal) {
    const raw = makeRaw([{ date: '01-01-2024', nav: navVal }]);
    const { records, rejected } = normalizeNavData(raw);
    assert.equal(records.length, 0, `expected record to be rejected for nav ${JSON.stringify(navVal)}`);
    assert.equal(rejected.length, 1);
    return rejected[0].reason;
  }

  it('rejects nav of null', () => {
    const reason = rejectReasonForNav(null);
    assert.match(reason, /missing/);
  });

  it('rejects nav of undefined', () => {
    const raw = makeRaw([{ date: '01-01-2024' }]); // nav key absent
    const { records, rejected } = normalizeNavData(raw);
    assert.equal(records.length, 0);
    assert.match(rejected[0].reason, /missing/);
  });

  it('rejects nav of "N.A." (common MFapi placeholder)', () => {
    const reason = rejectReasonForNav('N.A.');
    assert.match(reason, /not a finite number/);
  });

  it('rejects nav of empty string', () => {
    const reason = rejectReasonForNav('');
    assert.match(reason, /not a finite number/);
  });

  it('rejects nav of NaN', () => {
    const reason = rejectReasonForNav(NaN);
    assert.match(reason, /not a finite number/);
  });

  it('rejects nav of Infinity', () => {
    const reason = rejectReasonForNav(Infinity);
    assert.match(reason, /not a finite number/);
  });

  it('rejects nav of -Infinity', () => {
    const reason = rejectReasonForNav(-Infinity);
    assert.match(reason, /not a finite number/);
  });

  it('rejects nav of zero', () => {
    const reason = rejectReasonForNav('0');
    assert.match(reason, /must be greater than zero/);
  });

  it('rejects negative nav', () => {
    const reason = rejectReasonForNav('-5.5');
    assert.match(reason, /must be greater than zero/);
  });

  it('rejects nav of a non-numeric string', () => {
    const reason = rejectReasonForNav('abc');
    assert.match(reason, /not a finite number/);
  });

});

// ---------------------------------------------------------------------------
// 6. Mixed valid and invalid records in the same response
// ---------------------------------------------------------------------------

describe('normalizeNavData — mixed valid and invalid records', () => {

  it('separates valid records from rejected ones correctly', () => {
    const raw = makeRaw([
      { date: '08-10-2026', nav: '156.54'  },   // ✅ valid
      { date: '31-02-2026', nav: '100'     },   // ❌ invalid date
      { date: '07-10-2026', nav: 'N.A.'   },   // ❌ invalid nav
      { date: '06-10-2026', nav: '160.37'  },   // ✅ valid
      { date: '05-10-2026', nav: '0'       },   // ❌ nav = 0
    ]);

    const { records, rejected } = normalizeNavData(raw);

    assert.equal(records.length,  2);
    assert.equal(rejected.length, 3);

    assert.equal(records[0].date, '2026-10-08');
    assert.equal(records[1].date, '2026-10-06');
  });

  it('includes the original entry object in the rejected array', () => {
    const badEntry = { date: '31-02-2026', nav: '100' };
    const raw = makeRaw([badEntry]);
    const { rejected } = normalizeNavData(raw);

    // The rejected entry is a reference to the original object from rawResponse.data
    assert.deepEqual(rejected[0].entry, badEntry);
    assert.equal(typeof rejected[0].reason, 'string');
  });

});
