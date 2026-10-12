// src/services/financialMetricsService.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCAGR,
  calculateMaxDrawdown,
  calculateSharpeRatio,
  sanitizeAndSortNavHistory,
  computeComprehensiveMetrics,
} from './financialMetricsService.js';

test('sanitizeAndSortNavHistory cleans and sorts records chronologically', () => {
  const records = [
    { date: '2023-01-05', nav: 105 },
    { date: '2023-01-01', nav: 100 },
    { date: 'invalid-date', nav: 102 },
    { date: '2023-01-03', nav: -5 }, // invalid negative nav
    { date: '2023-01-02', nav: 101 },
  ];

  const result = sanitizeAndSortNavHistory(records);
  assert.equal(result.length, 3);
  assert.equal(result[0].nav, 100);
  assert.equal(result[1].nav, 101);
  assert.equal(result[2].nav, 105);
});

test('calculateCAGR calculates correct compound annual growth', () => {
  // 3-year period: 100 to 172.8 (which is (1.2)^3 = 1.728 -> 20.00% CAGR)
  const d1 = new Date('2020-01-01');
  const d2 = new Date('2023-01-01');

  const records = [
    { date: d1, nav: 100 },
    { date: new Date('2021-01-01'), nav: 120 },
    { date: new Date('2022-01-01'), nav: 144 },
    { date: d2, nav: 172.8 },
  ];

  const result = calculateCAGR(records, 3);
  assert.equal(result.cagr, 20);
  assert.equal(result.startDate, '2020-01-01');
  assert.equal(result.endDate, '2023-01-01');
});

test('calculateCAGR returns null when insufficient historical span', () => {
  const records = [
    { date: new Date('2023-01-01'), nav: 100 },
    { date: new Date('2023-06-01'), nav: 110 },
  ];
  // asking for 3 years when only 6 months exist
  const result = calculateCAGR(records, 3);
  assert.equal(result.cagr, null);
});

test('calculateMaxDrawdown calculates peak to trough decline correctly', () => {
  const records = [
    { date: new Date('2023-01-01'), nav: 100 },
    { date: new Date('2023-02-01'), nav: 120 }, // peak
    { date: new Date('2023-03-01'), nav: 90 },  // trough: (90 - 120) / 120 = -25%
    { date: new Date('2023-04-01'), nav: 110 },
    { date: new Date('2023-05-01'), nav: 130 }, // new peak
    { date: new Date('2023-06-01'), nav: 117 }, // drawdown: (117 - 130) / 130 = -10%
  ];

  const result = calculateMaxDrawdown(records);
  assert.equal(result.maxDrawdownPercent, -25);
  assert.equal(result.peakDate, '2023-02-01');
  assert.equal(result.troughDate, '2023-03-01');
  assert.equal(result.peakNav, 120);
  assert.equal(result.troughNav, 90);
});

test('calculateSharpeRatio produces positive ratio when returns exceed risk-free rate', () => {
  // Generate synthetic 3-year trading history (750 days) with steady uptrend + small noise
  const records = [];
  let nav = 100;
  const startDate = new Date('2020-01-01');

  for (let i = 0; i < 750; i++) {
    const d = new Date(startDate.getTime() + i * (24 * 60 * 60 * 1000));
    // slight positive drift: ~15% annual return
    const dailyReturn = 0.0006 + (Math.sin(i) * 0.002);
    nav = nav * (1 + dailyReturn);
    records.push({ date: d, nav });
  }

  const result = calculateSharpeRatio(records, 0.065, 3);
  assert.ok(result.sharpeRatio !== null);
  assert.ok(result.sharpeRatio > 0, `Expected Sharpe > 0, got ${result.sharpeRatio}`);
  assert.ok(result.annualizedVolatility > 0);
  assert.ok(result.annualizedReturn > 6.5);
});

test('computeComprehensiveMetrics handles empty or insufficient data gracefully', () => {
  const result = computeComprehensiveMetrics([]);
  assert.equal(result.isDataSufficient, false);
  assert.equal(result.cagr.threeYear, null);
  assert.equal(result.risk.sharpeRatio3Y, null);
});
