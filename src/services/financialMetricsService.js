// src/services/financialMetricsService.js
// Deterministic financial calculations for mutual fund NAV histories.
// Implements 1Y/3Y/5Y CAGR, Maximum Drawdown, and Annualized Sharpe Ratio.
// Strictly non-AI, testable mathematical functions.

const TRADING_DAYS_PER_YEAR = 250;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_RF_RATE = 0.065; // 6.50% Indian risk-free rate (T-Bills)
const MIN_OBSERVATIONS_3Y = 750; // Minimum trading days for 3Y reliability

/**
 * Ensure records are sorted in ascending chronological order (oldest to newest)
 * and have valid dates and positive NAV numbers.
 *
 * @param {Array<{date: Date|string, nav: number}>} records
 * @returns {Array<{date: Date, nav: number}>}
 */
export function sanitizeAndSortNavHistory(records) {
  if (!Array.isArray(records)) return [];

  return records
    .map((r) => ({
      date: r.date instanceof Date ? r.date : new Date(r.date),
      nav: Number(r.nav),
    }))
    .filter((r) => !isNaN(r.date.getTime()) && !isNaN(r.nav) && r.nav > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Filter a sorted NAV series to include records between startDate and endDate.
 *
 * @param {Array<{date: Date, nav: number}>} sortedRecords
 * @param {Date} [startDate]
 * @param {Date} [endDate]
 * @returns {Array<{date: Date, nav: number}>}
 */
export function filterByDateRange(sortedRecords, startDate, endDate) {
  return sortedRecords.filter((r) => {
    if (startDate && r.date < startDate) return false;
    if (endDate && r.date > endDate) return false;
    return true;
  });
}

/**
 * Calculate Compound Annual Growth Rate (CAGR) over a target period in years.
 *
 * Formula: ((NAV_end / NAV_start) ^ (1 / actual_years) - 1) * 100
 *
 * @param {Array<{date: Date, nav: number}>} sortedRecords
 * @param {number} years - e.g. 1, 3, or 5
 * @returns {{ cagr: number|null, startDate: string|null, endDate: string|null, actualYears: number|null }}
 */
export function calculateCAGR(sortedRecords, years) {
  if (!sortedRecords || sortedRecords.length < 2 || years <= 0) {
    return { cagr: null, startDate: null, endDate: null, actualYears: null };
  }

  const latest = sortedRecords[sortedRecords.length - 1];
  const targetStartDate = new Date(latest.date);
  targetStartDate.setUTCFullYear(targetStartDate.getUTCFullYear() - years);
  const targetStartTime = targetStartDate.getTime();

  // Find the record closest to targetStartTime
  let closestIndex = 0;
  let minDiff = Math.abs(sortedRecords[0].date.getTime() - targetStartTime);

  for (let i = 1; i < sortedRecords.length; i++) {
    const diff = Math.abs(sortedRecords[i].date.getTime() - targetStartTime);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }

  const start = sortedRecords[closestIndex];
  const elapsedDays = (latest.date.getTime() - start.date.getTime()) / MS_PER_DAY;
  const actualYears = elapsedDays / 365.25;

  // If closest observation is more than 45 days away or elapsed span is insufficient, return null
  if (minDiff > 45 * MS_PER_DAY || actualYears < years * 0.9) {
    return { cagr: null, startDate: null, endDate: null, actualYears: null };
  }

  const cagr = (Math.pow(latest.nav / start.nav, 1 / actualYears) - 1) * 100;

  return {
    cagr: Number(cagr.toFixed(2)),
    startDate: start.date.toISOString().split('T')[0],
    endDate: latest.date.toISOString().split('T')[0],
    actualYears: Number(actualYears.toFixed(2)),
  };
}

/**
 * Calculate Maximum Drawdown over the given sorted NAV series.
 *
 * Max Drawdown = min((NAV_t - Peak_t) / Peak_t) * 100
 *
 * @param {Array<{date: Date, nav: number}>} sortedRecords
 * @returns {{ maxDrawdownPercent: number|null, peakDate: string|null, troughDate: string|null, peakNav: number|null, troughNav: number|null }}
 */
export function calculateMaxDrawdown(sortedRecords) {
  if (!sortedRecords || sortedRecords.length < 2) {
    return {
      maxDrawdownPercent: null,
      peakDate: null,
      troughDate: null,
      peakNav: null,
      troughNav: null,
    };
  }

  let peakNav = sortedRecords[0].nav;
  let peakDate = sortedRecords[0].date;
  let maxDrawdown = 0; // negative or 0
  let maxPeakDate = peakDate;
  let maxTroughDate = sortedRecords[0].date;
  let maxPeakNav = peakNav;
  let maxTroughNav = sortedRecords[0].nav;

  for (let i = 1; i < sortedRecords.length; i++) {
    const current = sortedRecords[i];

    if (current.nav > peakNav) {
      peakNav = current.nav;
      peakDate = current.date;
    } else {
      const drawdown = (current.nav - peakNav) / peakNav;
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
        maxPeakDate = peakDate;
        maxTroughDate = current.date;
        maxPeakNav = peakNav;
        maxTroughNav = current.nav;
      }
    }
  }

  return {
    maxDrawdownPercent: Number((maxDrawdown * 100).toFixed(2)),
    peakDate: maxPeakDate.toISOString().split('T')[0],
    troughDate: maxTroughDate.toISOString().split('T')[0],
    peakNav: Number(maxPeakNav.toFixed(4)),
    troughNav: Number(maxTroughNav.toFixed(4)),
  };
}

/**
 * Calculate Annualized Sharpe Ratio over a period.
 *
 * Formula: (Annualized Return - Rf) / Annualized Volatility
 * where Annualized Volatility = stdDev(daily_returns) * sqrt(250)
 *
 * @param {Array<{date: Date, nav: number}>} sortedRecords
 * @param {number} [rfRate=0.065] - Risk-free rate (default 6.50%)
 * @param {number} [years=3]
 * @returns {{ sharpeRatio: number|null, annualizedReturn: number|null, annualizedVolatility: number|null, observationCount: number }}
 */
export function calculateSharpeRatio(sortedRecords, rfRate = DEFAULT_RF_RATE, years = 3) {
  if (!sortedRecords || sortedRecords.length < 2) {
    return {
      sharpeRatio: null,
      annualizedReturn: null,
      annualizedVolatility: null,
      observationCount: 0,
    };
  }

  // Filter for the last N years if specified
  const latest = sortedRecords[sortedRecords.length - 1];
  const targetStartTime = latest.date.getTime() - years * 365.25 * MS_PER_DAY;
  const filtered = sortedRecords.filter((r) => r.date.getTime() >= targetStartTime);

  if (filtered.length < 30) {
    // Insufficient samples to compute meaningful standard deviation
    return {
      sharpeRatio: null,
      annualizedReturn: null,
      annualizedVolatility: null,
      observationCount: filtered.length,
    };
  }

  // Calculate daily returns
  const dailyReturns = [];
  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1].nav;
    const curr = filtered[i].nav;
    if (prev > 0) {
      dailyReturns.push((curr - prev) / prev);
    }
  }

  if (dailyReturns.length < 2) {
    return {
      sharpeRatio: null,
      annualizedReturn: null,
      annualizedVolatility: null,
      observationCount: filtered.length,
    };
  }

  // Mean daily return
  const meanDaily = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;

  // Daily standard deviation
  const variance =
    dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanDaily, 2), 0) /
    (dailyReturns.length - 1);
  const dailyVolatility = Math.sqrt(variance);

  // Annualized volatility
  const annualizedVolatility = dailyVolatility * Math.sqrt(TRADING_DAYS_PER_YEAR);

  // Annualized return (using CAGR over the actual filtered window)
  const cagrResult = calculateCAGR(filtered, years);
  const annualizedReturnDecimal =
    cagrResult.cagr !== null
      ? cagrResult.cagr / 100
      : Math.pow(1 + meanDaily, TRADING_DAYS_PER_YEAR) - 1;

  if (annualizedVolatility <= 0) {
    return {
      sharpeRatio: null,
      annualizedReturn: Number((annualizedReturnDecimal * 100).toFixed(2)),
      annualizedVolatility: 0,
      observationCount: filtered.length,
    };
  }

  const sharpe = (annualizedReturnDecimal - rfRate) / annualizedVolatility;

  return {
    sharpeRatio: Number(sharpe.toFixed(2)),
    annualizedReturn: Number((annualizedReturnDecimal * 100).toFixed(2)),
    annualizedVolatility: Number((annualizedVolatility * 100).toFixed(2)),
    observationCount: filtered.length,
  };
}

/**
 * Comprehensive financial summary combining all approved criteria.
 *
 * @param {Array<{date: Date|string, nav: number}>} rawRecords
 * @param {object} [options]
 * @param {number} [options.rfRate=0.065]
 * @param {number} [options.expenseRatio=null]
 * @returns {object}
 */
export function computeComprehensiveMetrics(rawRecords, options = {}) {
  const rfRate = options.rfRate ?? DEFAULT_RF_RATE;
  const sorted = sanitizeAndSortNavHistory(rawRecords);

  if (sorted.length === 0) {
    return {
      isDataSufficient: false,
      totalObservations: 0,
      observations3Y: 0,
      dateRange: null,
      cagr: {
        oneYear: null,
        threeYear: null,
        fiveYear: null,
      },
      risk: {
        maxDrawdown3YPercent: null,
        drawdownPeakDate: null,
        drawdownTroughDate: null,
        sharpeRatio3Y: null,
        annualizedVolatility3YPercent: null,
        riskFreeRateApplied: rfRate,
      },
      expenseRatio: options.expenseRatio ?? null,
    };
  }

  const latest = sorted[sorted.length - 1];
  const earliest = sorted[0];

  const cagr1Y = calculateCAGR(sorted, 1);
  const cagr3Y = calculateCAGR(sorted, 3);
  const cagr5Y = calculateCAGR(sorted, 5);

  // 3-Year window for risk & drawdown metrics
  const target3YTime = latest.date.getTime() - 3 * 365.25 * MS_PER_DAY;
  const records3Y = sorted.filter((r) => r.date.getTime() >= target3YTime);

  const drawdown3Y = calculateMaxDrawdown(records3Y);
  const risk3Y = calculateSharpeRatio(sorted, rfRate, 3);

  const isDataSufficient = sorted.length >= MIN_OBSERVATIONS_3Y;

  return {
    isDataSufficient,
    totalObservations: sorted.length,
    observations3Y: records3Y.length,
    dateRange: {
      from: earliest.date.toISOString().split('T')[0],
      to: latest.date.toISOString().split('T')[0],
      latestNav: Number(latest.nav.toFixed(4)),
    },
    cagr: {
      oneYear: cagr1Y.cagr,
      threeYear: cagr3Y.cagr,
      fiveYear: cagr5Y.cagr,
    },
    risk: {
      maxDrawdown3YPercent: drawdown3Y.maxDrawdownPercent,
      drawdownPeakDate: drawdown3Y.peakDate,
      drawdownTroughDate: drawdown3Y.troughDate,
      sharpeRatio3Y: risk3Y.sharpeRatio,
      annualizedVolatility3YPercent: risk3Y.annualizedVolatility,
      riskFreeRateApplied: rfRate,
    },
    expenseRatio: options.expenseRatio ?? null,
  };
}
