// src/models/Fund.js
// Represents a mutual fund's metadata as returned by MFapi.

import mongoose from 'mongoose';

const fundSchema = new mongoose.Schema(
  {
    // The unique scheme code used by MFapi (e.g. 120716)
    schemeCode: {
      type: Number,
      required: [true, 'schemeCode is required'],
      unique: true,
      index: true,
    },

    schemeName: {
      type: String,
      required: [true, 'schemeName is required'],
      trim: true,
    },

    fundHouse: {
      type: String,
      default: '',
      trim: true,
    },

    schemeType: {
      type: String,
      default: '',
      trim: true,
    },

    schemeCategory: {
      type: String,
      default: '',
      trim: true,
    },

    // ISIN for the Growth option (may be empty for some schemes)
    isinGrowth: {
      type: String,
      default: '',
      trim: true,
    },

    // ISIN for the Dividend Re-investment option
    isinDivReinvestment: {
      type: String,
      default: '',
      trim: true,
    },

    // Timestamp of the most recent successful sync from MFapi
    lastSyncedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
    versionKey: false,
  }
);

const Fund = mongoose.model('Fund', fundSchema);
export default Fund;
