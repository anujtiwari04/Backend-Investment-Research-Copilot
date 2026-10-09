# Investment Research Copilot — Backend API

A clean, minimal Node.js/Express backend that gives mutual fund Relationship Managers (RMs) fast access to fund metadata and historical NAV data. It syncs data from [MFapi](https://api.mfapi.in) on demand and serves it from a local MongoDB store.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 (ESM) |
| Framework | Express.js 4 |
| Database | MongoDB with Mongoose 8 |
| Security | Helmet, CORS |
| Logging | Morgan |
| Dev server | Nodemon |

---

## Project Structure

```
src/
├── config/
│   └── database.js        # Mongoose connection & state helper
├── controllers/
│   ├── fundController.js  # Input validation + response formatting
│   └── healthController.js
├── middlewares/
│   └── errorHandler.js    # 404 handler + centralised error handler
├── models/
│   ├── Fund.js            # Fund metadata schema
│   └── NavHistory.js      # Daily NAV records schema (compound unique index)
├── routes/
│   ├── funds.js           # /api/funds route definitions
│   └── health.js          # /api/health route definition
├── services/
│   ├── fundService.js     # Business logic (list, sync, query)
│   └── mfApiService.js    # External HTTP calls to api.mfapi.in
├── utils/
│   ├── dateParser.js      # DD-MM-YYYY → UTC Date (no timezone drift)
│   └── response.js        # Consistent JSON response helpers
├── app.js                 # Express app configuration
└── server.js              # Server startup & graceful shutdown
```

---

## Getting Started

### Prerequisites
- Node.js 18 or later
- MongoDB running locally (`mongod`) **or** a MongoDB Atlas connection string

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set your values:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/investment_research_copilot
CORS_ORIGIN=http://localhost:3000
REQUEST_TIMEOUT_MS=15000
MFAPI_BASE_URL=https://api.mfapi.in/mf
```

> **Never commit `.env` to Git.** It is listed in `.gitignore`.

### 3. Start the server

**Development** (auto-restarts on file changes):
```bash
npm run dev
```

**Production:**
```bash
npm start
```

You should see:
```
[DB] Connected to MongoDB: 127.0.0.1
[Server] Running in development mode
[Server] Listening on http://localhost:5000
[Server] Health check: http://localhost:5000/api/health
```

---

## API Reference

All responses follow this envelope:

```json
// Success
{ "success": true, "data": { ... }, "message": "optional" }

// Error
{ "success": false, "error": { "message": "...", "code": "MACHINE_CODE" } }
```

---

### `GET /api/health`

Returns server and database status.

**Example response (200):**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected",
    "timestamp": "2024-12-01T10:00:00.000Z"
  }
}
```

Returns `503` with `"status": "degraded"` when MongoDB is not connected.

---

### `GET /api/funds`

Lists all synced funds. Supports pagination.

| Query param | Default | Description |
|---|---|---|
| `page` | `1` | Page number (1-indexed) |
| `limit` | `20` | Records per page (max 100) |

**Example:**
```
GET /api/funds?page=1&limit=5
```

---

### `GET /api/funds/:schemeCode`

Returns metadata for a single fund.

**Example:**
```
GET /api/funds/120716
```

Returns `404` if the fund has not been synced yet.

---

### `POST /api/funds/sync/:schemeCode`

Fetches fund metadata and full NAV history from MFapi and stores them in MongoDB. Safe to call repeatedly — uses bulk upserts, so no duplicates are created.

**Example:**
```
POST /api/funds/sync/120716
```

**Example response (200):**
```json
{
  "success": true,
  "message": "Fund \"Mirae Asset Large Cap Fund - Regular Plan - Growth\" synced successfully.",
  "data": {
    "fund": {
      "schemeCode": 120716,
      "schemeName": "Mirae Asset Large Cap Fund - Regular Plan - Growth",
      "fundHouse": "Mirae Asset Mutual Fund",
      "schemeType": "Open Ended Schemes",
      "schemeCategory": "Equity Scheme - Large Cap Fund",
      "isinGrowth": "INF769K01010",
      "isinDivReinvestment": "INF769K01028",
      "lastSyncedAt": "2024-12-01T10:00:00.000Z"
    },
    "sync": {
      "navInserted": 3842,
      "navTotal": 3842,
      "syncedAt": "2024-12-01T10:00:00.000Z"
    }
  }
}
```

---

### `GET /api/funds/:schemeCode/nav`

Returns paginated NAV history for a fund.

| Query param | Default | Description |
|---|---|---|
| `from` | — | Start date `YYYY-MM-DD` (inclusive) |
| `to` | — | End date `YYYY-MM-DD` (inclusive) |
| `page` | `1` | Page number |
| `limit` | `100` | Records per page (max 500) |

Results are sorted most-recent-first.

**Example:**
```
GET /api/funds/120716/nav?from=2024-01-01&to=2024-03-31&limit=50
```

---

## Testing with Postman

### Recommended test sequence

1. **Health check**
   ```
   GET http://localhost:5000/api/health
   ```
   → Expect `200` with `"database": "connected"`

2. **Sync scheme 120716**
   ```
   POST http://localhost:5000/api/funds/sync/120716
   ```
   → Expect `200` with fund metadata and `navInserted > 0`

3. **Sync the same fund again** (idempotency test)
   ```
   POST http://localhost:5000/api/funds/sync/120716
   ```
   → Expect `navInserted: 0` (no new records created; all already exist)

4. **Get fund metadata**
   ```
   GET http://localhost:5000/api/funds/120716
   ```

5. **Get NAV history (all)**
   ```
   GET http://localhost:5000/api/funds/120716/nav?limit=10
   ```

6. **Get NAV history with date filter**
   ```
   GET http://localhost:5000/api/funds/120716/nav?from=2024-01-01&to=2024-06-30
   ```

7. **List all funds**
   ```
   GET http://localhost:5000/api/funds
   ```

### Error scenario tests

| Scenario | Request | Expected |
|---|---|---|
| Invalid scheme code | `GET /api/funds/abc` | `400 INVALID_SCHEME_CODE` |
| Unsynced fund | `GET /api/funds/999999` | `404 FUND_NOT_FOUND` |
| Invalid MFapi scheme | `POST /api/funds/sync/999999` | `404 SCHEME_NOT_FOUND` |
| Invalid date | `GET /api/funds/120716/nav?from=not-a-date` | `400 INVALID_DATE` |
| Date range reversed | `GET /api/funds/120716/nav?from=2024-12-31&to=2024-01-01` | `400 INVALID_DATE_RANGE` |
| Unknown route | `GET /api/unknown` | `404 Route not found` |

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | ✅ | — | MongoDB connection string |
| `PORT` | ❌ | `5000` | HTTP port |
| `NODE_ENV` | ❌ | `development` | `development` or `production` |
| `CORS_ORIGIN` | ❌ | `*` | Comma-separated allowed origins |
| `REQUEST_TIMEOUT_MS` | ❌ | `15000` | MFapi request timeout in ms |
| `MFAPI_BASE_URL` | ❌ | `https://api.mfapi.in/mf` | MFapi base URL |

---

## Notes for Future Development

- **Authentication** — JWT middleware will be added before deploying to production.
- **AI Integration** — The service layer (`src/services/`) is the right place to add AI-powered analysis and scoring.
- **Rate limiting** — Add `express-rate-limit` before exposing the sync endpoint publicly.
- **Scheduled syncs** — A cron job calling `fundService.syncFund()` can automate daily NAV refreshes.
