# DECISIONS.md — Decision Log

Each entry: the decision, the options considered, and why the chosen option
won. Decisions are roughly in the order they had to be made.

---

## 1. What kind of app is this?

The brief and CSV (a roommate-style ledger of shared rent/groceries/utilities
with `paid_by`, `split_with`, `split_type`, `split_details`) describe a
**shared-expense / "who owes whom" ledger** — a Splitwise-style tool, not a
sales/contact CRM.

**Options considered**
- Generic sales CRM (contacts, deals, pipelines) — doesn't fit the CSV at all.
- Shared-expense ledger with CSV import, anomaly handling, and settle-up
  balances — directly matches every column in the CSV and every required
  deliverable (anomaly log, import report, schema for splits/settlements).

**Decision:** Shared-expense ledger ("Flatshare Ledger"). All schema and
feature decisions below follow from this.

---

## 2. Tech stack

**Decision:** Node.js + Express + Prisma + PostgreSQL on the backend,
React + Vite + Tailwind on the frontend, with a small Claude-API-powered
feature (see §9).

**Why:** This is the stack specified for the broader internship process and
is well-suited to the task — Prisma gives us a typed schema + migrations
(useful for documenting the schema in SCOPE.md), Postgres handles the
`Decimal` types needed for money cleanly, and Express keeps the API simple
enough to build quickly under the deadline.

---

## 3. Name normalisation strategy

The CSV has the same person written as `Aisha`, `priya` / `Priya` / `Priya S`,
and `Rohan` / `rohan ` (trailing space).

**Options considered**
- **Fuzzy string matching** (e.g. Levenshtein distance) to auto-merge similar
  names.
- **Explicit alias table**, mapping known variants → a canonical name.

**Decision:** Explicit alias table (`backend/src/importer/names.js`).

**Why:** A household has at most 5-7 people. Fuzzy matching on names this
short risks false merges (e.g. two genuinely different people with similar
names) and is hard to audit. An alias table is a few lines, is 100% auditable
in a code review, and every normalisation is logged as a `NAME_NORMALIZED`
anomaly so nothing happens silently.

---

## 4. Date parsing strategy

Almost all dates are `DD-MM-YYYY`. Two rows break that:
- `"Mar-14"` (month abbreviation + day, no year)
- `"04-05-2026"` (explicitly flagged in the source as ambiguous)

**Options considered for `"04-05-2026"`**
- Treat as `MM-DD-YYYY` → 5 April 2026.
- Treat as `DD-MM-YYYY` → 4 May 2026 (consistent with every other date).
- Reject the row entirely and require manual entry.

**Decision:** Interpret as `DD-MM-YYYY` (4 May 2026), for **consistency with
the rest of the file**, but flag it as `AMBIGUOUS_DATE` (WARNING) so a human
can correct it if the consistent interpretation happens to be wrong for this
one row. Rejecting the row felt too aggressive for one ambiguous field when
every other field on the row is fine.

For `"Mar-14"`, the year is inferred as **2026** because every other date in
the file is in 2026 and this row sits between February and March 2026 entries.

---

## 5. Currency handling — fixed FX rate vs. live API

Several Goa-trip rows are in USD.

**Options considered**
- Call a live FX-rate API at import time.
- Use a fixed, documented exchange rate.
- Keep USD and INR as separate, un-combined totals.

**Decision:** Fixed rate of **1 USD = ₹83**, applied at import time, with the
original amount/currency preserved on the record and an `FX_CONVERSION`
anomaly logged for every converted row.

**Why:** A live FX API adds an external dependency, a failure mode (API down
at import time), and non-reproducible imports (the same CSV imported twice on
different days would produce different balances). A fixed, documented rate is
reproducible and transparent — and since the goal is "who owes whom
*roughly*", a small FX variance doesn't change the outcome. The rate is
isolated in one constant (`USD_TO_INR_RATE` in `amounts.js`) so it's a
one-line change if a more accurate rate is needed.

---

## 6. Settlement detection (rows that aren't really "expenses")

Two rows describe direct payments between two people, not shared costs:
- `"Rohan paid Aisha back"` — `split_type` is empty, `split_with = "Aisha"`.
- `"Sam deposit share"` — `split_type = equal`, but notes say "paid Aisha his
  deposit".

**Options considered**
- Import everything as `Expense` rows and let the split-type/empty-field
  anomalies stand on their own.
- Detect a separate "Settlement" concept and route these rows there.

**Decision:** A separate `Settlement` model. A row is classified as a
settlement if **either**:
1. `split_type` is empty, **or**
2. the description/notes contain settlement-style keywords
   (`deposit`, `paid ... back`, `reimburse`, `settle`, `owe`)

   **and**, in both cases, `split_with` (minus the payer) names exactly one
   other person.

**Why:** A 1-on-1 transfer isn't "shared" by the household and including it
as a normal `Expense` with `split_with` of size 1 would distort the splits
table for no benefit. Modelling it explicitly makes the balance calculation
correct (a settlement directly adjusts two people's balances rather than
being divided) and self-documenting.

**Risk acknowledged:** this is a heuristic. It's logged as a
`SETTLEMENT_DETECTED` anomaly every time it fires, so a reviewer can correct
a misclassification.

---

## 7. Duplicate detection

Two duplicate-looking pairs exist:
- Rows 5/6: identical date, payer, amount, and (after normalising
  punctuation/case) description → near-certainly the *same* expense logged
  twice.
- Rows 24/25: same date and similar description, but **different** payer and
  amount → possibly the same dinner, logged by two different people with
  different totals.

**Options considered**
- Auto-delete exact duplicates.
- Flag everything for manual review without touching balances.
- Flag exact duplicates and exclude the second one from balance totals, but
  flag "looks similar but differs" pairs without changing balances.

**Decision:** The third option — exact duplicates (rows 5/6) are imported but
the second occurrence is excluded from balance totals (`excludeFromBalances =
true`, `isDuplicateOf` set) and flagged for confirmation before deletion.
Same-day/similar-description-but-different-amount pairs (rows 24/25) are
imported as normal **and both flagged**, with no change to balances, because
the importer can't know which (if either) figure is correct.

**Why:** Auto-deleting data the user might want to audit later felt too
destructive for an automated import. Excluding from balances (rather than
deleting) gives the correct "who owes whom" answer immediately while
preserving a full audit trail.

---

## 8. `split_type` vs `split_details` precedence

Row 42 ("Furniture for common room") has `split_type = equal` but also a
`split_details` value (`"Aisha 1; Rohan 1; Priya 1; Sam 1"`), which is only
meaningful for `share`/`percentage`/`unequal` types.

**Options considered**
- Let `split_details` win whenever it's present, regardless of `split_type`.
- Let `split_type` win; ignore `split_details` if it doesn't match the type.

**Decision:** `split_type` is authoritative. If `split_details` is present
but `split_type = equal`, the amount is split equally and `split_details` is
ignored, with a `SPLIT_DETAILS_IGNORED` anomaly logged.

**Why:** `split_type` is the more deliberate, structured field; treating the
free-text `split_details` as an override would mean a stray value in that
column could silently change how money is split. In this specific row the two
interpretations happen to agree (1:1:1:1 shares = an equal split), but the
*rule* needs to be decided independently of this coincidence — see anomaly log
for the flag either way.

---

## 9. AI feature ("AI-native" requirement)

**Decision:** When an import finishes, the app calls the Claude API once with
the structured anomaly list and asks for a short, plain-English summary
("In this import, 2 expenses look like duplicates — rows 5 and 6 both look
like the same dinner paid by Dev...") shown at the top of the Import Report.

**Options considered**
- A chatbot for querying balances ("How much does Rohan owe Aisha?").
- An AI-written plain-English import summary.
- AI-assisted categorisation of expenses (rent/groceries/utilities/etc).

**Why this one:** The anomaly log is the most "judged" artifact in this
assignment and is naturally technical/tabular. A short natural-language
summary turns it into something a non-technical housemate could read at a
glance, and it's a small, low-risk integration (one summarisation call per
import, not on the critical path for any calculation — if the Claude API call
fails, the structured Import Report still renders normally). See
`AI_USAGE.md` for prompts and where this went wrong during development.

---

## 10. Negative and zero amounts

- Row 26 ("Parasailing refund", -30 USD) is a credit.
- Row 31 ("Dinner order Swiggy", ₹0) is a zero-value placeholder.

**Decision:** Both are imported as normal `Expense` rows. A negative amount
naturally produces negative `amountOwedInInr` values for each split
participant (i.e. a credit toward their balance); a zero amount has no effect.
Both are flagged (`NEGATIVE_AMOUNT` / `ZERO_AMOUNT`) for human review rather
than special-cased, because the arithmetic already "just works" — special-
casing would add complexity without changing the result.

---

## 11. Household roster / membership drift

Meera moves out at the end of March; Sam moves in during April. One April
row still lists Meera in `split_with` (the row's own note: "oops Meera still
in the group list").

**Decision:** A small, explicit "roster departures" list
(`ROSTER_DEPARTURES` in `engine.js`) records that Meera left after 29 March
2026. Any later row that still includes Meera in `split_with` gets an
`INACTIVE_PERSON_IN_SPLIT` (WARNING) anomaly, but **the data is not altered**
— Meera's split is kept as recorded.

**Why:** Automatically removing Meera and redistributing her share would be
guessing at intent (maybe she really was still using groceries that week).
Flagging without altering preserves the source data while surfacing the issue
for a human decision.

---

## 12. Deployment

**Decision:** Frontend on Vercel (static React/Vite build), backend on
Render, Postgres via a free-tier hosted instance (e.g. Render Postgres or
Neon). See `README.md` for the exact steps.

**Why:** All three offer generous free tiers, deploy directly from a GitHub
repo (satisfying the "meaningful commit history" requirement by deploying
incrementally), and require no server management — important given the
timeline.
