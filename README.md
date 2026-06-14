# Flatshare Ledger

A shared-expense ("who owes whom") tracker for a household, built for the
Spreetail SDE Internship take-home assignment. Import a messy expenses CSV,
get an automated **Import Report** of every data-quality issue found and how
it was handled, then track balances and settle-ups.

- **Live app:** _add your deployed URL here_
- **Repo:** _add your GitHub URL here_

See also: [`SCOPE.md`](./SCOPE.md) (anomaly log + schema),
[`DECISIONS.md`](./DECISIONS.md) (decision log),
[`AI_USAGE.md`](./AI_USAGE.md) (AI tools used).

---

## Tech stack

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Express + Prisma
- **Database:** PostgreSQL
- **AI:** Claude API (Sonnet), used for an optional natural-language summary
  of each Import Report (see DECISIONS.md #9 and AI_USAGE.md)

---

## Project structure

```
flatshare-ledger/
├── backend/
│   ├── prisma/schema.prisma     # database schema
│   └── src/
│       ├── importer/            # CSV import + anomaly detection engine
│       ├── services/             # balance calculation, AI summary
│       ├── routes/               # Express API routes
│       └── server.js
├── frontend/
│   └── src/
│       ├── pages/                # Dashboard, Expenses, Settlements, Import, People
│       ├── api.js                # API client
│       └── Layout.jsx
├── Expenses_Export.csv          # the provided sample data
├── SCOPE.md
├── DECISIONS.md
└── AI_USAGE.md
```

---

## Setup

### Prerequisites
- Node.js 18+
- A PostgreSQL database (local, Docker, or a hosted free-tier instance such
  as Neon / Render Postgres)

### 1. Backend

```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL to your Postgres connection string.
# ANTHROPIC_API_KEY is optional - see "AI summary" below.

npm install
npx prisma migrate dev --name init   # creates tables
npm run dev                          # starts the API on http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env   # defaults to http://localhost:4000/api, edit if needed
npm install
npm run dev             # starts the dev server, usually on http://localhost:5173
```

### 3. Import the sample data

Open the app, go to **Import CSV**, and upload `Expenses_Export.csv` (in the
repo root). This will:
- create all `Person` records found in the file
- create `Expense` and `Settlement` records
- run anomaly detection and show the **Import Report** (with an AI summary,
  if `ANTHROPIC_API_KEY` is set)

You can also run the importer standalone from the command line, without a
database, to inspect what it detects:

```bash
cd backend
node src/importer/runImport.js ../Expenses_Export.csv
```

This prints the full anomaly list, every parsed expense/settlement, and a
quick balance calculation - useful for debugging the import logic itself.

---

## AI summary feature

If you set `ANTHROPIC_API_KEY` in `backend/.env`, every CSV import makes one
call to the Claude API (model `claude-sonnet-4-6`) to turn the structured
anomaly list into a short, plain-English paragraph shown at the top of the
Import Report. This is entirely optional - without the key, the Import Report
still shows the full structured anomaly table, just without the summary
paragraph. See `AI_USAGE.md` for the prompt used and how this feature was
debugged.

---

## Deployment

A simple free-tier deployment:

1. **Database:** Create a free Postgres instance (e.g.
   [Neon](https://neon.tech) or Render Postgres). Copy its connection string
   into `DATABASE_URL`.
2. **Backend:** Deploy `backend/` to [Render](https://render.com) (or
   Railway/Fly.io) as a Node web service.
   - Build command: `npm install && npx prisma generate && npx prisma migrate deploy`
   - Start command: `npm start`
   - Set `DATABASE_URL` and (optionally) `ANTHROPIC_API_KEY` as environment
     variables.
3. **Frontend:** Deploy `frontend/` to [Vercel](https://vercel.com) or
   Netlify as a static Vite build.
   - Build command: `npm install && npm run build`
   - Output directory: `dist`
   - Set `VITE_API_URL` to your deployed backend's `/api` URL.

---

## Available scripts (backend)

| Script | What it does |
|---|---|
| `npm run dev` | Starts the Express API |
| `npm run prisma:migrate` | Runs Prisma migrations |
| `node src/importer/runImport.js <csv>` | Runs the import pipeline standalone (no DB), prints results to the console |

---

## Notes on the data model

See `SCOPE.md` for the full schema and an explanation of every model
(`Person`, `Import`, `Expense`, `ExpenseSplit`, `Settlement`,
`AnomalyRecord`). In short:

- Every CSV upload becomes one `Import` row.
- Each data row becomes either an `Expense` (a shared cost, with one
  `ExpenseSplit` per participant) or a `Settlement` (a direct
  person-to-person payment, e.g. "Rohan paid Aisha back").
- Every data-quality issue found becomes an `AnomalyRecord`, linked to the
  `Import` that found it. These records power both the Import Report UI and
  `SCOPE.md`.
