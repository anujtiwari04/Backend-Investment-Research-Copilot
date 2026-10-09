// src/models/NavHistory.js
// Stores daily NAV (Net Asset Value) records for each mutual fund.
// A compound unique index on (schemeCode + date) prevents duplicates
// so repeated syncs are always safe.

import mongoose from 'mongoose';

const navHistorySchema = new mongoose.Schema(
  {
    // References the Fund's schemeCode (numeric, matching MFapi)
    schemeCode: {
      type: Number,
      required: [true, 'schemeCode is required'],
      index: true,
    },

    // Calendar date of the NAV — stored at midnight UTC to avoid timezone drift.
    // Input dates are parsed from MFapi's "DD-MM-YYYY" format.
    date: {
      type: Date,
      required: [true, 'date is required'],
    },

    // NAV value converted from the MFapi string to a Number
    nav: {
      type: Number,
      required: [true, 'nav is required'],
      min: [0, 'nav must be non-negative'],
    },
  },
  {
    // No timestamps needed here — date field already captures the NAV date.
    versionKey: false,
  }
);

// Compound unique index: one NAV record per scheme per calendar date
navHistorySchema.index({ schemeCode: 1, date: 1 }, { unique: true });

const NavHistory = mongoose.model('NavHistory', navHistorySchema);
export default NavHistory;
