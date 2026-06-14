# AI_USAGE.md

## AI tools used

- **Claude (Sonnet 4.6)**, via the Claude.ai chat interface with code
  execution, for the entire build: schema design, the CSV import/anomaly
  engine, API routes, and the React frontend.
- **Claude API** (model `claude-sonnet-4-6`), integrated into the app itself
  as the "AI summary" feature on the Import Report (see DECISIONS.md #9).

## Key prompts

The work was driven by one long conversation rather than many separate
prompts. The key prompts, roughly in order:

1. *"Here's the assignment email and a CSV export — go through the CSV and
   identify data quality problems before we even have the spec."* — Claude
   did an initial pass over the CSV and listed the anomalies (duplicates,
   inconsistent names, bad dates, percentage splits not summing to 100%,
   etc.) before any code was written.

2. *"Build this as a shared-expense ledger app — schema, import/anomaly
   engine, API, frontend, and the required docs (SCOPE/DECISIONS/AI_USAGE)."*
   — this was the umbrella instruction; Claude broke it into the schema
   first, then the importer (with a standalone CLI runner to test against
   the real CSV before wiring up the database), then routes, then the
   frontend.

3. *"Run the importer against the real CSV and show me everything it
   detects."* — used repeatedly to validate the anomaly engine against the
   42 actual rows, which is how SCOPE.md's anomaly table was produced (it's
   a direct write-up of this output).

## Concrete cases where the AI got something wrong

### 1. `npx tailwindcss init -p` failed — assumed Tailwind v3 setup

When scaffolding the frontend, Claude ran `npx tailwindcss init -p` to set up
Tailwind, which is the standard Tailwind v3 workflow. The command failed
(`npm error could not determine executable to run`) because the project had
installed **Tailwind v4**, which removed the `init` CLI command entirely and
uses a CSS-first configuration (`@import "tailwindcss"` plus
`@tailwindcss/postcss`).

**How caught:** the command's error output, plus checking
`node_modules/tailwindcss/package.json` and seeing `"version": "4.3.1"`.

**What changed:** dropped `tailwindcss init`/`tailwind.config.js` entirely,
installed `@tailwindcss/postcss`, wrote a manual `postcss.config.js`, and
replaced `src/index.css` with the v4 `@import "tailwindcss"` + `@theme`
syntax for custom colors (`--color-brand`, `--color-positive`, etc.).

### 2. Percentage-split rescaling — initial implementation didn't flag the mismatch

For "Pizza Friday" and "Weekend brunch", `split_details` percentages sum to
110% (30+30+30+20), not 100%. The first version of `calculateSplits()`
normalised the percentages to sum to 100% (dividing each by the total and
multiplying by 100) **without recording why** — it silently "fixed" the
numbers with no anomaly entry, which would have made SCOPE.md incomplete and
hidden a real data-entry mistake in the source spreadsheet from the user.

**How caught:** while writing SCOPE.md from the importer's anomaly output, the
anomaly list was missing any mention of rows 15 and 32 even though their
percentages clearly didn't sum to 100 — a manual check of the math (30+30+30+20
= 110) caught the gap.

**What changed:** added an explicit `PERCENTAGE_SUM_MISMATCH` (WARNING)
anomaly any time the percentages don't sum to 100, stating the original
percentages, the rescale factor applied, and that it's worth a human glance.

### 3. Settlement detection initially misclassified "Sam deposit share" as a normal expense

The first pass at duplicate/settlement detection only checked for an **empty
`split_type`** (which correctly caught "Rohan paid Aisha back", row 14). Row
38 ("Sam deposit share") has `split_type = equal` and `split_with = "Aisha"`,
so it slipped through as a regular two-person "equal" expense — which is
wrong, since it's actually Sam handing Aisha his move-in deposit, a 1:1
transfer.

**How caught:** when manually reviewing the parsed expense list, row 38
showed up as an "equal" split between just Sam and Aisha (₹7500 each), which
looked suspicious for a "deposit" line — a normal household expense with only
2 of 5+ people in `split_with` would be unusual.

**What changed:** extended settlement detection to also check the
description/notes text for settlement-style keywords (`deposit`, `paid ...
back`, `reimburse`, `settle`, `owe`) when `split_with` (excluding the payer)
names exactly one person — even if `split_type` is filled in. This is logged
as a `SETTLEMENT_DETECTED` anomaly so the (heuristic, keyword-based)
classification is auditable and reversible if wrong for some other row.

## Notes

- The AI-summary feature itself (Claude API call in
  `backend/src/services/aiSummary.js`) is designed to fail safe: if
  `ANTHROPIC_API_KEY` is missing or the request errors, `summarizeAnomalies()`
  returns `null` and the Import Report renders normally without the
  paragraph — this was a deliberate requirement when writing that file, not
  something caught after the fact.
- The fixed USD→INR rate (₹83) and the "interpret 04-05-2026 as 4 May" choice
  in `dates.js`/`amounts.js` are AI-suggested defaults, explicitly flagged as
  assumptions in both the code comments and DECISIONS.md, rather than
  presented as definitely-correct.
