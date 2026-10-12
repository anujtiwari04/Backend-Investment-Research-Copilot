// src/scripts/seedFunds.js
// Seeds target mutual funds into MongoDB and prints their real calculated scorecard.

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import { syncFund, getFundScorecard } from '../services/fundService.js';

const FUNDS_TO_SEED = [
  { code: 100312, label: 'LIC MF Flexi Cap Fund - Regular Plan - IDCW' },
  { code: 100055, label: 'Aditya Birla Sun Life Gilt Plus - Liquid Plan - Growth - Regular Plan' },
  { code: 120716, label: 'UTI Nifty 50 Index Fund - Growth - Direct Plan' },
];

async function seed() {
  console.log('--- Connecting to MongoDB ---');
  await connectDB();

  for (const { code, label } of FUNDS_TO_SEED) {
    console.log(`\n========================================`);
    console.log(`[Seed] Processing: ${label} (Scheme Code: ${code})`);
    console.log(`========================================`);

    try {
      console.log(`[Sync] Fetching NAV history from MFapi and upserting into MongoDB...`);
      const syncResult = await syncFund(code);
      console.log(`[Sync] Done! ${syncResult.navTotal} historical NAV records saved.`);

      console.log(`[Scorecard] Generating quantitative scorecard...`);
      const { scorecard } = await getFundScorecard(code);

      console.log(`\nResults for "${scorecard.schemeName}":`);
      console.log(`  * Overall Score: ${scorecard.overallScore} / 100`);
      console.log(`  * Recommendation: ${scorecard.recommendation}`);
      console.log(`  * Observation Count: ${scorecard.dataSufficiency.totalObservations} total (${scorecard.dataSufficiency.observations3Y} in 3Y window)`);
      console.log(`  * Breakdown:`);
      for (const item of scorecard.criteriaBreakdown) {
        console.log(`    - ${item.criterion} [${item.weight}]: Value = ${item.fundValue} | Score = ${item.score}/100`);
      }
      console.log(`  * Key Drivers:`);
      for (const driver of scorecard.keyDrivers) {
        console.log(`    > ${driver}`);
      }
    } catch (err) {
      console.error(`[Error] Failed to seed scheme ${code}:`, err.message);
    }
  }

  console.log('\n--- Seeding Complete ---');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Fatal seeding error:', err);
  process.exit(1);
});
