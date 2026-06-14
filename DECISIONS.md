# DECISIONS.md — Engineering Decision Log

Each entry documents a technical decision made during the design and implementation of Flatshare Ledger. Format: **Problem → Options Considered → Selected Approach → Why → Tradeoffs**. Written to be defensible in a technical interview.

Decisions are ordered roughly as they were encountered during development.

---

## Decision 1 — What Kind of Application Is This?

### Problem
The assignment provided a CSV with columns `date`, `description`, `paid_by`, `amount`, `currency`, `split_type`, `split_with`, `split_details`, `notes`. The brief said to build a "shared expenses management application" but left the interpretation open.

### Options Considered
1. **Generic financial dashboard** — charts and tables of raw expense data, no domain modelling
2. **Sales CRM** — contacts, deals, pipelines (did not match the CSV at all)
3. **Splitwise-style shared-expense ledger** — CSV import, anomaly handling, per-person net balances, settle-up suggestions

### Selected Approach
Option 3 — a Splitwise-style shared-expense ledger with a focus on the CSV import pipeline and data-quality reporting.

### Why It Was Chosen
Every column in the CSV maps directly to this domain model. `split_with` is a per-expense participant list. `split_type` (`equal`, `percentage`, `share`, `unequal`) are the four common expense-splitting strategies. `paid_by` is the payer. The required deliverables (anomaly log, import report, schema for splits/settlements) are natural outputs of this domain.

### Tradeoffs
Committing to this interpretation early constrained the schema design. If the interpretation were wrong, significant refactoring would be needed. Risk was mitigated by verifying every column maps cleanly before writing any code.

---

## Decision 2 — Database Selection: SQLite (dev) + PostgreSQL (production)

### Problem
The app needs a relational database to store expenses, splits, settlements, and anomaly records. Choosing the wrong database engine affects schema expressiveness, decimal precision, and deployment complexity.

### Options Considered
1. **PostgreSQL only** — requires a running server even for local development
2. **MySQL** — requires a running server; weaker Decimal type support than PostgreSQL
3. **SQLite** — file-based, zero-config, but limited concurrency and no native Decimal type
4. **SQLite (dev) + PostgreSQL (prod)** — zero-config locally; full production capability

### Selected Approach
SQLite for local development (`DATABASE_URL=file:./dev.db`), PostgreSQL for production (Neon / Render free tier). Prisma's abstraction layer makes the switch a one-line `.env` change.

### Why It Was Chosen
The original schema used PostgreSQL's `@db.Decimal(12, 2)` annotations for money fields. When PostgreSQL was unavailable in the development environment, the schema was adapted to remove `@db.Decimal` directives (which are provider-specific) while keeping `Decimal` field types — Prisma handles 2dp money arithmetic correctly on SQLite's `REAL` storage. This provides a working app immediately with zero infrastructure setup, while the schema is production-ready once a PostgreSQL URL is substituted.

### Tradeoffs
- SQLite does not support concurrent writes — acceptable for single-developer local testing
- SQLite stores Decimal as REAL (floating-point) internally — Prisma's Decimal.js wrapper adds the necessary precision at the application layer
- The schema cannot use PostgreSQL-specific features (e.g. `@db.Decimal`) in the shared version, which is a minor expressiveness loss

---

## Decision 3 — ORM Selection: Prisma

### Problem
The backend needs to talk to the database. Options range from raw SQL to full-featured ORMs.

### Options Considered
1. **Raw SQL** (`pg` / `better-sqlite3`) — maximum control, no abstraction overhead
2. **Knex.js** — query builder; typed but schema-free
3. **Sequelize** — mature ORM, verbose model definitions
4. **Prisma** — schema-first ORM with auto-migrations, generated client, and TypeScript-ready types

### Selected Approach
Prisma 6.x.

### Why It Was Chosen
- **`schema.prisma` is the single source of truth** — it documents the data model for SCOPE.md without needing a separate ER diagram or wiki entry. Every stakeholder (reviewer, senior engineer) can read it directly.
- **Auto-migrations** (`prisma migrate dev`) mean schema changes are tracked in version control and applied consistently across environments
- **Generated client** provides field-level type safety (e.g. `prisma.expense.create({ data: { splitType: "EQUAL" } })` — mistyped fields are caught at dev time)
- **Readable query API** — `prisma.expense.findMany({ include: { splits: { include: { person: true } } } })` is self-documenting

### Tradeoffs
- Heavier than raw SQL for simple CRUD — the Prisma client adds ~50ms to cold-start time
- Schema migrations require the Prisma CLI in the dev environment
- The generated client can lag behind the latest Prisma server releases

---

## Decision 4 — Authentication Strategy: None

### Problem
Should the app require users to log in?

### Options Considered
1. **JWT-based stateless auth** — access tokens issued on login
2. **Session-based auth** — server-side sessions with cookies
3. **No authentication** — all endpoints public

### Selected Approach
No authentication for this take-home assignment.

### Why It Was Chosen
This is a single-household tool, not a multi-tenant SaaS application. The use case is one shared instance used by 4–7 housemates who all trust each other with the data. Adding authentication would add substantial complexity (user model, login flow, token management, protected routes on both frontend and backend) without addressing any real threat in this context.

### Tradeoffs
- Any user with the deployment URL can read/modify all data
- Acceptable for the assignment scope and household-scale deployment
- **If deployed publicly:** would add JWT auth (Passport.js + `jsonwebtoken`) with per-household data isolation as the first post-assignment feature

---

## Decision 5 — Currency Handling: Fixed FX Rate

### Problem
Several Goa-trip rows are denominated in USD. Balance calculations require all amounts in a single currency (INR). Options for USD→INR conversion:

### Options Considered
1. **Live FX rate API** — fetch the rate at import time from a service like ExchangeRate-API or Open Exchange Rates
2. **Fixed documented rate** — hardcode `1 USD = ₹83` in the codebase
3. **Keep currencies separate** — maintain USD and INR as separate balance tracks, no conversion

### Selected Approach
Fixed rate: `USD_TO_INR_RATE = 83` in `backend/src/importer/amounts.js`, applied at import time. Original `amountOriginal` and `currencyOriginal` are always preserved on the `Expense` record alongside the converted `amountInInr` and `exchangeRateUsed`.

### Why It Was Chosen
- **Reproducibility:** the same CSV imported twice on different days produces identical balances. A live rate would make imports non-deterministic — a Tuesday import and a Wednesday import of the same file would differ.
- **No external dependency:** a live FX API introduces a network call on the import critical path. If the API is down, the entire import fails for a reason unrelated to the CSV's data quality.
- **Transparency:** the rate is a single named constant. If ₹83 is deemed inaccurate, it is a one-line change. Every converted row carries `exchangeRateUsed = 83` in the database, so the conversion is always traceable.
- **Fitness for purpose:** for the "who owes whom roughly" use case, a rate that is within a few percent of the real rate changes nobody's actual payment behaviour.

### Tradeoffs
- ₹83 may be several percent away from the rate that actually applied on the trip dates
- A more accurate implementation would store the historical rate from a reliable source (e.g. RBI's reference rate for the specific date)

---

## Decision 6 — Duplicate Detection: Two-Tier Strategy

### Problem
The CSV contains two types of potential duplicates:
- Rows 5/6: Identical date, payer, amount, and (normalized) description — almost certainly double-entry
- Rows 24/25: Same date and similar description, but different payer (Aisha vs Rohan) and different amount (₹2,400 vs ₹2,450) — possibly the same dinner logged by two people

### Options Considered
1. **Auto-delete exact duplicates** — keep only the first occurrence
2. **Flag all potential duplicates without touching balances** — import all, mark all
3. **Tier 1: exclude exact duplicates from balances; Tier 2: flag near-duplicates without exclusion**

### Selected Approach
Option 3 — two-tier strategy implemented in `detectDuplicates()` in `engine.js`:
- **Tier 1 (POSSIBLE_DUPLICATE):** same date + same payer + same original amount + same currency + matching normalized description → second row gets `excludeFromBalances = true`, `isDuplicateOf` set to the first row's id
- **Tier 2 (POSSIBLE_DUPLICATE_DIFFERENT_AMOUNTS):** same date + matching normalized description, but different payer or amount → both rows imported as normal, both `flagged = true`, neither excluded

Description normalization: lowercase → strip punctuation → remove common filler words (`at`, `the`, `a`, `an`, `-`) → split and sort remaining words → rejoin. This matches `"Dinner at Marina Bites"` and `"dinner - marina bites"`.

### Why It Was Chosen
Auto-deletion (Option 1) is irreversible and makes the import destructive. For a financial ledger, preserving the source data and flagging it for human confirmation is the correct default. Flagging without touching balances (Option 2) would leave wrong balances in place until a human acts. Option 3 gives the correct balance immediately (exclude the second occurrence of an exact duplicate) while still requiring human confirmation before permanent deletion.

### Tradeoffs
- The normalized-description match could produce false positives for genuinely different expenses at the same venue on the same day (e.g. two Swiggy orders on the same date)
- Near-duplicates (Tier 2) are included in balances even though one of them may be wrong — this is intentional because the importer cannot determine which amount is correct

---

## Decision 7 — Settlement Processing: Separate Model

### Problem
Two rows describe direct person-to-person transfers, not shared household costs:
- Row 14: "Rohan paid Aisha back" — Rohan repaying a debt to Aisha
- Row 38: "Sam deposit share" — Sam paying his move-in deposit to Aisha

If treated as normal expenses with two participants, they would be split between the two people named — which is mathematically wrong for a repayment. ("Rohan paid Aisha back ₹5,000" as a 2-person equal expense would mean both Rohan and Aisha each owe ₹2,500, which makes no sense.)

### Options Considered
1. **Import as Expense** — let the anomaly flags stand; user corrects manually
2. **Separate Settlement model** — classify the row differently, adjust balances directly

### Selected Approach
A separate `Settlement` model. Detection heuristic in `engine.js`:

A row is classified as a Settlement if **both**:
- `split_with` (minus the payer) names **exactly one** other person
- **Either:** `split_type` is empty **or** `description + notes` matches the keyword regex `/deposit|paid.*back|reimburs|settle?ment|owes?/i`

Balance formula for settlements: `fromPerson.balance += amount; toPerson.balance -= amount`. This correctly represents a direct transfer without the group.

### Why It Was Chosen
The mathematical model for a repayment is fundamentally different from a shared expense. A settlement is a transfer between two people, not a cost shared among the group. Modelling it correctly produces correct balances without manual intervention. The heuristic is logged as a `SETTLEMENT_DETECTED` anomaly every time it fires, making it auditable and correctable if it misclassifies a future row.

### Tradeoffs
- The keyword-based detection is a heuristic — it could fire on legitimate expenses with settlement-like descriptions
- The empty-`split_type` detection was implemented first (catching row 14); the keyword extension was added after row 38 was manually identified as misclassified (see AI_USAGE.md)
- Every classification is logged, so no classification is silent

---

## Decision 8 — Household Membership Timeline: Explicit Departure List

### Problem
Meera moves out at the end of March 2026. Row 36 (02-04-2026) still includes Meera in `split_with` — the row's own note says "oops Meera still in the group list". Sam joins in April. The system needs to flag post-departure appearances without altering data.

### Options Considered
1. **Auto-remove departed members from splits** — redistribute their share among remaining participants
2. **Hard error** — reject rows that include departed members
3. **Warning + preserve** — flag the anomaly but keep the data as-is

### Selected Approach
`ROSTER_DEPARTURES` array in `engine.js`:
```javascript
const ROSTER_DEPARTURES = [
  { person: "Meera", leftAfter: new Date(Date.UTC(2026, 2, 29)) }
];
```
Any row dated after a departure's `leftAfter` that includes that person in `split_with` generates an `INACTIVE_PERSON_IN_SPLIT` (WARNING). Data is not altered.

The `Person` model stores `isActive` and `leftAt` for display purposes. `isActive = false` does not prevent a person from appearing in splits — it is a display/roster flag, not a constraint.

### Why It Was Chosen
Auto-redistribution (Option 1) guesses at intent. Maybe Meera genuinely bought groceries during her last week and the data is correct. The importer cannot know. Flagging and preserving gives the user the information needed to make the decision while keeping the source data intact.

### Tradeoffs
- The departure list is hardcoded in `engine.js` — adding a new departure requires a code change
- A future improvement would store departure dates in the `Person.leftAt` column and query them dynamically during import

---

## Decision 9 — Balance Calculation Algorithm

### Problem
With expenses, splits, and settlements spread across multiple models, there needs to be a clear, deterministic formula for computing each person's net balance.

### Options Considered
1. **SQL aggregate query** — SUM expenses paid minus SUM splits owed plus SUM settlements
2. **Application-layer calculation** — load all relevant records, compute in JavaScript

### Selected Approach
Application-layer calculation in `backend/src/services/balances.js`. Convention: **positive balance = group owes this person money; negative = this person owes the group.**

```
For each non-excluded Expense:
  payer.balance += expense.amountInInr
  for each split:
    split.person.balance -= split.amountOwedInInr

For each Settlement:
  fromPerson.balance += settlement.amountInInr
  toPerson.balance -= settlement.amountInInr
```

Settle-up suggestions use a greedy matching algorithm: sort creditors and debtors by balance magnitude descending; iteratively match the largest debtor with the largest creditor until all balances are within ±₹0.01 of zero. Produces at most `n-1` transactions for `n` people.

### Why It Was Chosen
The application-layer approach is easier to test, debug, and reason about than a multi-join SQL aggregate. The dataset is small (tens to hundreds of expenses per import period) so there is no performance concern. The greedy settle-up algorithm is O(n log n) and produces optimal or near-optimal results for the small household sizes this app targets.

### Tradeoffs
- Loads all non-excluded expenses and settlements into memory for the calculation — fine for household scale, not for thousands of expenses
- Greedy settle-up is not always globally optimal for minimising transaction count, but for ≤10 people the difference is negligible

---

## Decision 10 — Import Architecture: Modular Pipeline with Standalone CLI

### Problem
The CSV import logic is complex enough (date parsing, name normalisation, amount handling, FX conversion, split calculation, duplicate detection) that testing it requires either mocking the database or running the full stack.

### Options Considered
1. **Monolithic import function** — parse CSV and write to DB in one function
2. **Modular pipeline with DB-free parser** — separate parsing from persistence; provide a CLI entry point

### Selected Approach
Modular pipeline with a standalone CLI runner:
- `engine.js` — orchestrates the full parse pipeline; returns a pure JavaScript object `{ people, expenses, settlements, anomalies, summary }`. No database calls.
- `importService.js` — takes the result of `engine.js` and persists everything to the database via Prisma
- `runImport.js` — calls `engine.js` and prints the result to stdout; no database required
- Modules: `names.js`, `dates.js`, `amounts.js`, `splits.js`, `severity.js` — each handles one concern

### Why It Was Chosen
The standalone CLI (`node src/importer/runImport.js ../Expenses_Export.csv`) was the primary development tool. It allowed the entire anomaly engine to be iterated against the real 42-row CSV without needing a running database. This is how all 24 anomalies in SCOPE.md were discovered and validated — the CLI output was compared manually against the raw CSV. The clean separation also means the import logic can be unit-tested without a database.

### Tradeoffs
- Two-pass architecture (parse first, persist second) holds the entire parse result in memory — acceptable for CSV files of reasonable size
- `importService.js` uses sequential `await` calls rather than bulk transactions for simplicity, which is slower than a single transaction for large imports

---

## Decision 11 — API Design: RESTful Resource-Based Endpoints

### Problem
What shape should the backend API take?

### Options Considered
1. **GraphQL** — flexible queries, single endpoint, strong typing
2. **tRPC** — end-to-end type safety with TypeScript
3. **REST with Express** — standard resource-based routes

### Selected Approach
REST with Express:
- `POST /api/imports` — CSV upload; returns full Import Report
- `GET /api/imports` / `GET /api/imports/:id` — list / get report
- `GET /api/expenses` / `PATCH /api/expenses/:id` / `DELETE /api/expenses/:id` — expense management
- `GET /api/settlements` / `POST /api/settlements` — settlements
- `GET /api/people` / `POST /api/people` / `PATCH /api/people/:id` — people
- `GET /api/balances` — balances + settle-up suggestions

### Why It Was Chosen
The app's operations are simple CRUD plus one complex upload endpoint. GraphQL's flexibility is justified when clients need to compose complex nested queries dynamically — that's not the case here. REST with conventional HTTP semantics is immediately understandable to any reviewer and requires no additional runtime or tooling. The `POST /api/imports` response includes the full Import Report inline (anomalies + summary) so the frontend doesn't need to make a second request after upload.

### Tradeoffs
- No schema documentation (no OpenAPI spec) — a future improvement
- The frontend fetches full expense lists rather than paginating — acceptable for household-scale data volumes
- Error responses are ad-hoc JSON objects (`{ error: "message" }`) rather than a standardised error schema

---

## Decision 12 — Error Handling: Fail-Safe at Every Layer

### Problem
A CSV import involves many parsing steps, each of which can fail. A single bad row should not abort an import with 42 rows. An absent AI API key should not prevent the Import Report from rendering.

### Options Considered
1. **Abort on first error** — strict, but loses all data from the import
2. **Collect errors, then decide** — import succeeds if error count is below a threshold
3. **Never abort; flag and continue** — every bad row is handled gracefully and logged

### Selected Approach
Option 3 — the pipeline never aborts for a single bad row. Per-field fallbacks ensure every row produces *some* output. The severity tier determines how that output affects balances:
- **ERROR** rows: imported with `excludeFromBalances = true` — visible in the UI but do not affect anyone's balance until manually corrected
- **WARNING/INFO** rows: imported normally with the automated fix applied; anomaly record created for traceability

**AI summary fail-safe:** `summarizeAnomalies()` wraps the Claude API call in `try/catch`. If `ANTHROPIC_API_KEY` is absent, the function returns `null` immediately. If the API call throws, it logs the error and returns `null`. The Import Report renders fully in both cases — the AI summary paragraph simply does not appear.

**Express error handler:** a generic `(err, req, res, next)` middleware at the bottom of `server.js` catches any unhandled exceptions and returns a `500` response with an error message, preventing the server from crashing.

### Why It Was Chosen
Financial import tools must never silently discard data. A strict abort-on-error approach would mean a single comma in an amount field prevents 41 other rows from being imported. The fail-safe approach preserves the maximum possible data, flags everything that needs attention, and gives the user actionable information to fix each issue.

### Tradeoffs
- The database may contain records with `excludeFromBalances = true` that are never manually fixed — the balances will be correct, but the excluded rows accumulate as a growing list of unresolved items
- The generic Express error handler swallows the stack trace in production — structured error logging (e.g. Sentry) would be a production improvement

