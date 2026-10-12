// src/services/scoringService.js
// Deterministic Mutual Fund Scoring Engine based on 4 quantitative criteria:
// 1. Returns vs Benchmark (35% weight)
// 2. Sharpe Ratio (30% weight)
// 3. Maximum Drawdown (20% weight)
// 4. Expense Ratio / TER (15% weight)
// Strictly non-AI, auditable mathematical scoring.

export const SCORING_WEIGHTS = {
  RETURNS_VS_BENCHMARK: 0.35,
  SHARPE_RATIO: 0.30,
  MAX_DRAWDOWN: 0.20,
  EXPENSE_RATIO: 0.15,
};

export const DEFAULT_BENCHMARK = {
  name: 'Nifty 50 TRI',
  cagr3Y: 14.5, // 3-Year CAGR baseline for Nifty 50 TRI
  asOfDate: '2026-10-01',
};

// Known default expense ratios by fund category if not provided in metadata
export const DEFAULT_EXPENSE_RATIOS = {
  INDEX: 0.25, // 0.25% for direct index funds
  ACTIVE_EQUITY: 0.85, // 0.85% for direct flexi-cap/active equity
  HYBRID: 0.95,
  DEFAULT: 0.75,
};

/**
 * Score Returns vs Benchmark (0 to 100).
 * Alpha = Fund 3Y CAGR - Benchmark 3Y CAGR
 * Alpha 0% (matching benchmark) = 75 points
 * +3% alpha = ~99 points, -3% alpha = ~51 points.
 *
 * @param {number|null} fundCagr3Y
 * @param {number} [benchmarkCagr3Y=14.5]
 * @returns {{ score: number, raw: number|null, alpha: number|null }}
 */
export function scoreReturnsVsBenchmark(fundCagr3Y, benchmarkCagr3Y = DEFAULT_BENCHMARK.cagr3Y) {
  if (fundCagr3Y === null || isNaN(fundCagr3Y)) {
    return { score: 50, raw: null, alpha: null, status: 'INSUFFICIENT_DATA' };
  }

  const alpha = Number((fundCagr3Y - benchmarkCagr3Y).toFixed(2));
  // Linear scale: 75 + (alpha * 8), clamped to [10, 100]
  const score = Math.max(10, Math.min(100, Math.round(75 + alpha * 8)));

  return { score, raw: fundCagr3Y, alpha, status: 'VERIFIED' };
}

/**
 * Score Sharpe Ratio (0 to 100).
 * Measures risk-adjusted excess returns over 6.50% Rf.
 * Sharpe 1.5+ = 95-100, Sharpe 1.0 = 75-80, Sharpe 0.5 = 50-55.
 *
 * @param {number|null} sharpe
 * @returns {{ score: number, raw: number|null }}
 */
export function scoreSharpeRatio(sharpe) {
  if (sharpe === null || isNaN(sharpe)) {
    return { score: 50, raw: null, status: 'INSUFFICIENT_DATA' };
  }

  // Linear scale: 30 + (sharpe * 45), clamped to [10, 100]
  const score = Math.max(10, Math.min(100, Math.round(30 + sharpe * 45)));
  return { score, raw: sharpe, status: 'VERIFIED' };
}

/**
 * Score Maximum Drawdown (0 to 100).
 * Measures downside resilience over the 3-year observation window.
 * 0% to -10% drawdown = 90-100 points
 * -15% drawdown = 80 points
 * -25% drawdown = 60 points
 * -40%+ drawdown = 10-30 points
 *
 * @param {number|null} maxDrawdownPercent - e.g. -14.2
 * @returns {{ score: number, raw: number|null }}
 */
export function scoreMaxDrawdown(maxDrawdownPercent) {
  if (maxDrawdownPercent === null || isNaN(maxDrawdownPercent)) {
    return { score: 50, raw: null, status: 'INSUFFICIENT_DATA' };
  }

  const absDD = Math.abs(maxDrawdownPercent);
  // Linear scale: 110 - (absDD * 2), clamped to [10, 100]
  const score = Math.max(10, Math.min(100, Math.round(110 - absDD * 2)));
  return { score, raw: maxDrawdownPercent, status: 'VERIFIED' };
}

/**
 * Score Expense Ratio / TER (0 to 100).
 * Lower is better.
 * 0.20% TER = 94 points
 * 0.50% TER = 85 points
 * 1.00% TER = 70 points
 * 2.00% TER = 40 points
 *
 * @param {number|null} expenseRatioPercent - e.g. 0.30
 * @returns {{ score: number, raw: number|null }}
 */
export function scoreExpenseRatio(expenseRatioPercent) {
  if (expenseRatioPercent === null || isNaN(expenseRatioPercent)) {
    return { score: 50, raw: null, status: 'ESTIMATED' };
  }

  // Linear scale: 100 - (expenseRatioPercent * 30), clamped to [10, 100]
  const score = Math.max(10, Math.min(100, Math.round(100 - expenseRatioPercent * 30)));
  return { score, raw: expenseRatioPercent, status: 'VERIFIED' };
}

/**
 * Determine recommendation band from overall composite score.
 * Band thresholds:
 * - >= 75: ADD
 * - 50 - 74: HOLD
 * - < 50: REDUCE
 *
 * @param {number} overallScore
 * @returns {'ADD' | 'HOLD' | 'REDUCE'}
 */
export function determineRecommendationBand(overallScore) {
  if (overallScore >= 75) return 'ADD';
  if (overallScore >= 50) return 'HOLD';
  return 'REDUCE';
}

/**
 * Build a complete, structured fund scorecard.
 *
 * @param {object} metrics - Output from financialMetricsService.computeComprehensiveMetrics
 * @param {object} fundMeta - Scheme metadata
 * @param {object} [customBenchmark]
 * @returns {object} Full scorecard payload
 */
export function generateScorecard(metrics, fundMeta = {}, customBenchmark = {}) {
  const benchmark = { ...DEFAULT_BENCHMARK, ...customBenchmark };

  // Resolve TER: explicit metric -> fund property -> inferred default
  let ter = metrics.expenseRatio;
  if (ter === null || ter === undefined) {
    const isIndex = (fundMeta.schemeName || '').toLowerCase().includes('index');
    ter = isIndex ? DEFAULT_EXPENSE_RATIOS.INDEX : DEFAULT_EXPENSE_RATIOS.ACTIVE_EQUITY;
  }

  const fundCagr3Y = metrics.cagr ? metrics.cagr.threeYear : null;
  const sharpe = metrics.risk ? metrics.risk.sharpeRatio3Y : null;
  const drawdown = metrics.risk ? metrics.risk.maxDrawdown3YPercent : null;

  const returnEval = scoreReturnsVsBenchmark(fundCagr3Y, benchmark.cagr3Y);
  const sharpeEval = scoreSharpeRatio(sharpe);
  const drawdownEval = scoreMaxDrawdown(drawdown);
  const terEval = scoreExpenseRatio(ter);

  // Weighted overall calculation
  const overallScore = Math.round(
    returnEval.score * SCORING_WEIGHTS.RETURNS_VS_BENCHMARK +
    sharpeEval.score * SCORING_WEIGHTS.SHARPE_RATIO +
    drawdownEval.score * SCORING_WEIGHTS.MAX_DRAWDOWN +
    terEval.score * SCORING_WEIGHTS.EXPENSE_RATIO
  );

  const recommendation = determineRecommendationBand(overallScore);

  // Generate deterministic audit rationale bullets
  const keyDrivers = [];
  if (returnEval.alpha !== null) {
    keyDrivers.push(
      returnEval.alpha >= 0
        ? `Outperforming ${benchmark.name} by +${returnEval.alpha}% over 3-year horizon.`
        : `Trailing ${benchmark.name} by ${returnEval.alpha}% over 3-year horizon.`
    );
  }
  if (sharpe !== null) {
    keyDrivers.push(`Delivering a 3-Year Sharpe ratio of ${sharpe} against a 6.50% risk-free hurdle.`);
  }
  if (drawdown !== null) {
    keyDrivers.push(`Maximum downside peak-to-trough decline contained at ${drawdown}%.`);
  }
  keyDrivers.push(`Total Expense Ratio of ${ter}% (${ter <= 0.5 ? 'low-cost tier' : 'standard active tier'}).`);

  return {
    schemeCode: fundMeta.schemeCode,
    schemeName: fundMeta.schemeName,
    fundHouse: fundMeta.fundHouse,
    overallScore,
    recommendation,
    scoringDate: new Date().toISOString().split('T')[0],
    criteriaBreakdown: [
      {
        criterion: 'Returns vs Benchmark',
        weight: '35%',
        weightValue: SCORING_WEIGHTS.RETURNS_VS_BENCHMARK,
        fundValue: fundCagr3Y !== null ? `${fundCagr3Y}%` : 'N/A',
        benchmarkValue: `${benchmark.cagr3Y}% (${benchmark.name})`,
        score: returnEval.score,
        status: returnEval.status,
      },
      {
        criterion: 'Risk-Adjusted Return (Sharpe)',
        weight: '30%',
        weightValue: SCORING_WEIGHTS.SHARPE_RATIO,
        fundValue: sharpe !== null ? `${sharpe}` : 'N/A',
        benchmarkValue: '6.50% Rf Hurdle',
        score: sharpeEval.score,
        status: sharpeEval.status,
      },
      {
        criterion: 'Downside Protection (Max Drawdown)',
        weight: '20%',
        weightValue: SCORING_WEIGHTS.MAX_DRAWDOWN,
        fundValue: drawdown !== null ? `${drawdown}%` : 'N/A',
        benchmarkValue: '3-Year Peak',
        score: drawdownEval.score,
        status: drawdownEval.status,
      },
      {
        criterion: 'Cost Efficiency (Expense Ratio)',
        weight: '15%',
        weightValue: SCORING_WEIGHTS.EXPENSE_RATIO,
        fundValue: `${ter}%`,
        benchmarkValue: 'Direct Plan',
        score: terEval.score,
        status: terEval.status,
      },
    ],
    keyDrivers,
    dataSufficiency: {
      isSufficient: metrics.isDataSufficient,
      observations3Y: metrics.observations3Y || 0,
      totalObservations: metrics.totalObservations || 0,
    },
  };
}
