# Flatshare Ledger

A production-quality shared-expense tracker built for the **Spreetail Software Developer Internship** take-home assignment. Upload a messy household expenses CSV, receive a structured **Import Report** cataloguing every data-quality issue found and the automated resolution applied, then track per-person balances and suggested settle-up transactions.

- **Live app:** https://flatshare-ledger.vercel.app/
- **GitHub:** https://github.com/ravindrareddy17/flatshare-ledger.git

> See also:
> [`SCOPE.md`](./SCOPE.md) — full anomaly log + database schema documentation
> [`DECISIONS.md`](./DECISIONS.md) — engineering decision log (17 decisions)
> [`AI_USAGE.md`](./AI_USAGE.md) — AI tools used, validation process, and corrections made
> [`IMPORT_REPORT.md`](./IMPORT_REPORT.md) — production import report for `Expenses_Export.csv`

---

## Project Overview

Flatshare Ledger solves a common real-world problem: a shared household accumulates expenses paid by different people in different amounts across different splits, and at the end of a period nobody knows who owes whom what. This app ingests the raw CSV exported from a shared spreadsheet, normalises every inconsistency it finds, flags what it cannot confidently resolve, and presents actionable balances.

The CSV import pipeline handles: inconsistent name casing and aliases, multiple date formats, currency ambiguity, amounts with thousands-separator commas, sub-paisa precision, multi-currency (USD→INR conversion), four split types (equal, percentage, share-weighted, unequal), duplicate detection, settlement classification, and household membership drift.

---

## Features

| Feature | Description |
|---|---|
| **CSV Import** | Upload any CSV matching the expected schema; the importer normalises and flags every anomaly |
| **Import Report** | Full anomaly table (severity + action taken) rendered after each upload |
| **AI Summary** | Optional Claude-powered plain-English paragraph summarising the Import Report (requires `ANTHROPIC_API_KEY`) |
| **Balance Dashboard** | Net balance per person (positive = owed money, negative = owes money) |
| **Settle-up Suggestions** | Greedy minimal-transaction algorithm shows who should pay whom to zero all balances |
| **Expense Management** | List all expenses; toggle `excludeFromBalances`; view per-person split breakdown |
| **Settlement Recording** | Manually record direct person-to-person payments |
| **People Management** | Add household members; mark as moved out (preserves expense history) |
| **Multi-currency** | USD→INR at a fixed documented rate; original amount/currency always preserved |
| **4 Split Types** | Equal, Percentage (with rescaling), Share-weighted, Unequal |
| **Duplicate Detection** | Exact duplicates excluded from balances; near-duplicates flagged for review |
| **Roster Drift Detection** | Warns when an inactive (moved-out) person appears in a split |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│   React 19 + Vite 8 + Tailwind CSS 4                       │
│   Pages: Dashboard · Expenses · Settlements · Import · People│
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP / REST (fetch)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express 4 API (port 4000)                  │
│                                                             │
│  POST /api/imports   ── CSV upload ──► Import Pipeline      │
│  GET  /api/imports/:id              ◄── Import Report       │
│  GET  /api/expenses                 ◄── Expense list        │
│  PATCH /api/expenses/:id            ── Toggle exclude       │
│  GET  /api/settlements              ◄── Settlement list     │
│  POST /api/settlements              ── Manual settle-up     │
│  GET  /api/people                   ◄── People list        │
│  GET  /api/balances                 ◄── Balances + suggestions│
│                                                             │
│  Import Pipeline:                                           │
│    engine.js → importService.js → Prisma → SQLite/Postgres  │
│                    │                                        │
│                    └──► aiSummary.js → Claude API (optional)│
└────────────────────────┬────────────────────────────────────┘
                         │ Prisma ORM
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         SQLite (dev) / PostgreSQL (production)              │
│  Tables: people · imports · expenses · expense_splits       │
│          settlements · anomaly_records                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Frontend framework | React | 19.x | |
| Frontend build tool | Vite | 8.x | |
| CSS framework | Tailwind CSS | 4.x | CSS-first config (`@import "tailwindcss"`) |
| Backend runtime | Node.js | 18+ | |
| Backend framework | Express | 4.x | |
| ORM | Prisma | 6.x | Schema-first with auto-migrations |
| Database (dev) | SQLite | — | File-based, zero-config |
| Database (prod) | PostgreSQL | 14+ | Neon / Render free tier |
| CSV parsing | csv-parse | 5.x | Synchronous parse for pipeline simplicity |
| File upload | multer | 1.x | Temp-file strategy, cleaned up post-import |
| AI integration | Anthropic Claude API | claude-sonnet-4-6 | Optional; gracefully absent |
| Routing (frontend) | React Router | 7.x | |

---

## Database Design

### Entity-Relationship Overview

```
Person ──┬─< Expense         (paidBy)
         ├─< ExpenseSplit     (person)
         ├─< Settlement       (fromPerson)
         └─< Settlement       (toPerson)

Import ──┬─< Expense
         ├─< Settlement
         └─< AnomalyRecord

Expense ──< ExpenseSplit
```

### Table Summary

| Table | Purpose |
|---|---|
| `people` | Every person who has ever appeared as a payer or split participant, including guests |
| `imports` | One row per CSV upload; drives the Import Report summary counts |
| `expenses` | Each shared household cost with original and INR-normalised amounts |
| `expense_splits` | Per-person owed amount for each expense |
| `settlements` | Direct person-to-person payments; not split among the group |
| `anomaly_records` | Every data-quality issue detected during import |

See [`SCOPE.md`](./SCOPE.md) for full column-level schema documentation.

---

## Installation Steps

### Prerequisites

- **Node.js 18+** (`node --version`)
- No external database required for local development (SQLite is used automatically)

### Clone and Install

```bash
git clone <your-repo-url>
cd flatshare-ledger
```

### Backend

```bash
cd backend
cp .env.example .env
# No edits needed for local dev — SQLite is pre-configured

npm install
npx prisma migrate dev --name init   # Creates the SQLite database and all tables
npm run dev                          # Starts the API on http://localhost:4000
```

### Frontend

```bash
cd frontend
cp .env.example .env
# Default: VITE_API_URL=http://localhost:4000/api (no changes needed)

npm install
npm run dev                          # Starts on http://localhost:5173
```

### Import the Sample Data

1. Open the app at `http://localhost:5173`
2. Navigate to **Import CSV**
3. Upload `Expenses_Export.csv` from the repo root

The importer will create all Person records, Expense and Settlement records, run anomaly detection, and display the Import Report. See [`IMPORT_REPORT.md`](./IMPORT_REPORT.md) for the expected output.

You can also run the importer standalone (no database) for debugging:

```bash
cd backend
node src/importer/runImport.js ../Expenses_Export.csv
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `file:./dev.db` | SQLite path (dev) or PostgreSQL connection string (prod) |
| `PORT` | No | `4000` | Express server port |
| `ANTHROPIC_API_KEY` | No | — | Enables AI-powered Import Report summary. Import works fully without it. |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | No | `http://localhost:4000/api` | Backend API base URL |

---

## Running Locally

```bash
# Terminal 1 — Backend
cd backend && npm run dev
# Output: "Flatshare Ledger API listening on port 4000"

# Terminal 2 — Frontend
cd frontend && npm run dev
# Output: "VITE ready in XXXms → Local: http://localhost:5173/"
```

Health check: `curl http://localhost:4000/api/health` → `{"status":"ok"}`

---

## Deployment

### Free-tier production setup

**1. Database** — Create a free PostgreSQL instance:
- [Neon](https://neon.tech) (recommended — instant, no credit card)
- [Render Postgres](https://render.com/docs/free#free-postgresql-databases)

Copy the connection string as `DATABASE_URL`.

**2. Backend** — Deploy `backend/` to [Render](https://render.com) as a Node web service:
- **Build command:** `npm install && npx prisma generate && npx prisma migrate deploy`
- **Start command:** `npm start`
- **Environment variables:** `DATABASE_URL`, `PORT=4000`, `ANTHROPIC_API_KEY` (optional)

**3. Frontend** — Deploy `frontend/` to [Vercel](https://vercel.com) or Netlify:
- **Framework preset:** Vite
- **Build command:** `npm install && npm run build`
- **Output directory:** `dist`
- **Environment variable:** `VITE_API_URL=https://your-backend.onrender.com/api`

---

## CSV Import Feature

### Expected CSV Schema

```
date, description, paid_by, amount, currency, split_type, split_with, split_details, notes
```

| Column | Expected Format | Notes |
|---|---|---|
| `date` | `DD-MM-YYYY` | Mon-DD (no year) also handled |
| `paid_by` | Person name | Normalised via alias table |
| `amount` | Decimal | Thousands commas stripped; 2dp rounding applied |
| `currency` | `INR` or `USD` | Defaults to INR if empty |
| `split_type` | `equal`, `percentage`, `share`, `unequal` | Case-insensitive; empty triggers settlement detection |
| `split_with` | Semicolon-delimited names | Names normalised individually |
| `split_details` | `Name value; Name value` | Meaning depends on split_type |
| `notes` | Free text | Used for settlement keyword detection |

### Anomaly Severity Levels

| Severity | Meaning | Effect on Balances |
|---|---|---|
| `INFO` | Cosmetic fix (name casing, comma in amount, missing currency) | None |
| `WARNING` | Judgement call made (duplicate, ambiguous date, percentage rescaling) | Row included; human should review |
| `ERROR` | Cannot process confidently (missing payer) | Row **excluded** from balances |

---

## Balance Calculation Logic

**Convention:** positive balance = group owes this person money (they paid more than their share). Negative balance = this person owes the group.

**For each non-excluded Expense:**
```
payer.balance += expense.amountInInr
foreach participant in splits:
    participant.balance -= split.amountOwedInInr
```

**For each Settlement:**
```
fromPerson.balance += settlement.amountInInr
toPerson.balance -= settlement.amountInInr
```

**Settle-up suggestions:** greedy matching algorithm — sort creditors and debtors by balance magnitude (descending), iteratively match the largest debtor with the largest creditor until all balances are zeroed. Produces at most `n-1` transactions for `n` people.

---

## Assumptions

1. All dates in the dataset fall within **2026** (year inferred for partial date formats)
2. **DD-MM-YYYY** is the canonical date format; ambiguous dates interpreted consistently with this format
3. **INR** is the default currency when the `currency` column is empty
4. **1 USD = ₹83** fixed conversion rate (documented, not live; see [`DECISIONS.md`](./DECISIONS.md))
5. The household has 4–7 members; name normalisation uses an explicit alias table rather than fuzzy matching
6. **Meera** left the household after 29 March 2026; **Sam** joined in April 2026
7. `split_type` is authoritative over `split_details` when both are present and contradictory
8. A row with an empty `split_type` AND `split_with` naming exactly one other person is a Settlement, not an Expense

---

## AI Tools Used

- **Claude (Sonnet 4.6)** via Claude.ai chat interface — used throughout the build for schema design, import/anomaly engine, API routes, React frontend, and documentation
- **Claude API** (`claude-sonnet-4-6`) integrated into the app as the optional Import Report AI summary

See [`AI_USAGE.md`](./AI_USAGE.md) for the full development workflow, key prompts, and detailed examples of AI suggestions that were incorrect and how they were caught and corrected.

---

## Available Scripts

### Backend

| Script | What it does |
|---|---|
| `npm run dev` | Start Express API server |
| `npm start` | Production start (same as dev for this project) |
| `npx prisma migrate dev` | Create/apply DB migrations |
| `npx prisma generate` | Regenerate Prisma client after schema changes |
| `node src/importer/runImport.js <csv>` | Run the import pipeline standalone (no DB) |

### Frontend

| Script | What it does |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production bundle to `dist/` |
| `npm run preview` | Locally preview the production build |

---

## Future Improvements

| Priority | Improvement | Rationale |
|---|---|---|
| High | **Authentication** | Multi-household support; currently a single shared instance |
| High | **Live FX rates** | Replace fixed USD→INR rate with a rate fetched at import time (cached) |
| Medium | **Expense categories** | Tag expenses as rent/groceries/utilities for per-category reporting |
| Medium | **Edit expense splits** | Currently splits are read-only post-import; manual correction UI needed |
| Medium | **Recurring expense templates** | Rent and utilities are entered every month; templates would save effort |
| Low | **Export to CSV** | Allow exporting the cleaned, normalised data |
| Low | **Email notifications** | Notify housemates when a new import is posted or a settle-up is recorded |
| Low | **Mobile-optimised layout** | Current design is desktop-first |
| Low | **Audit log** | Track who made manual changes (exclude/include expense, PATCH operations) |
