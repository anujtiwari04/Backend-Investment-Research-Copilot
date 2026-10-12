// src/services/scoringService.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreReturnsVsBenchmark,
  scoreSharpeRatio,
  scoreMaxDrawdown,
  scoreExpenseRatio,
  determineRecommendationBand,
  generateScorecard,
} from './scoringService.js';

test('determineRecommendationBand accurately assigns ADD, HOLD, and REDUCE bands', () => {
  assert.equal(determineRecommendationBand(85), 'ADD');
  assert.equal(determineRecommendationBand(75), 'ADD');
  assert.equal(determineRecommendationBand(74), 'HOLD');
  assert.equal(determineRecommendationBand(50), 'HOLD');
  assert.equal(determineRecommendationBand(49), 'REDUCE');
  assert.equal(determineRecommendationBand(20), 'REDUCE');
});

test('scoreReturnsVsBenchmark gives high score for outperforming benchmark', () => {
  // Benchmark 14.5%, Fund 18.0% (+3.5% alpha)
  const result = scoreReturnsVsBenchmark(18.0, 14.5);
  assert.ok(result.score >= 90);
  assert.equal(result.alpha, 3.5);
});

test('scoreExpenseRatio gives higher score for lower TER', () => {
  const lowCost = scoreExpenseRatio(0.20);
  const highCost = scoreExpenseRatio(1.80);
  assert.ok(lowCost.score > highCost.score);
});

test('generateScorecard compiles all 4 criteria into a weighted composite score', () => {
  const mockMetrics = {
    isDataSufficient: true,
    totalObservations: 1200,
    observations3Y: 750,
    cagr: { oneYear: 18.2, threeYear: 16.5, fiveYear: 15.0 },
    risk: {
      maxDrawdown3YPercent: -12.4,
      sharpeRatio3Y: 1.15,
      annualizedVolatility3YPercent: 14.2,
      riskFreeRateApplied: 0.065,
    },
    expenseRatio: 0.30,
  };

  const fundMeta = {
    schemeCode: 120716,
    schemeName: 'UTI Nifty 50 Index Fund - Growth',
    fundHouse: 'UTI Mutual Fund',
  };

  const scorecard = generateScorecard(mockMetrics, fundMeta);
  assert.equal(scorecard.schemeCode, 120716);
  assert.equal(scorecard.criteriaBreakdown.length, 4);
  assert.ok(scorecard.overallScore >= 75);
  assert.equal(scorecard.recommendation, 'ADD');
  assert.equal(scorecard.keyDrivers.length, 4);
});
