# AI_USAGE.md — AI Tools, Workflow, and Validation

This document describes how AI tools were used during development of Flatshare Ledger, how AI-generated output was validated, and three detailed cases where the AI produced incorrect suggestions — including how each error was detected and corrected.

---

## AI Tools Used

### 1. Claude (Sonnet 4.6) — Development Assistant

**Interface:** Claude.ai chat with code execution  
**Used for:** The majority of the build — schema design, the CSV import/anomaly engine, Express API routes, React frontend components, and documentation drafts.

**Scope of AI assistance:**
- Initial CSV analysis: identifying anomalies and edge cases before any code was written
- Schema design: first draft of `prisma/schema.prisma` and data model decisions
- Import pipeline implementation: `engine.js`, `names.js`, `dates.js`, `amounts.js`, `splits.js`, `severity.js`
- API route implementation: `imports.js`, `expenses.js`, `people.js` (routes), `balances.js`, `aiSummary.js`
- React frontend: `Layout.jsx`, `App.jsx`, page components (`Dashboard`, `Expenses`, `Settlements`, `ImportCsv`, `People`)
- Documentation: initial drafts of `SCOPE.md`, `DECISIONS.md`, and `AI_USAGE.md`

### 2. Claude API (claude-sonnet-4-6) — In-App AI Feature

**Interface:** Anthropic REST API (`POST https://api.anthropic.com/v1/messages`)  
**Used for:** The optional natural-language summary of each Import Report, shown at the top of the Import Report UI after a CSV upload.  
**Implementation:** `backend/src/services/aiSummary.js`  
**Activation:** Only when `ANTHROPIC_API_KEY` is set in `backend/.env`. The Import Report renders fully without it.

---

## Development Workflow

The build was driven by a single iterative conversation with Claude rather than many isolated prompts. The process followed this sequence:

1. **Pre-code CSV analysis** — Claude was given the raw `Expenses_Export.csv` and asked to identify every data-quality problem before any code was written. This produced the initial anomaly list that later became `SCOPE.md`.

2. **Schema design** — Claude proposed the initial Prisma schema based on the CSV columns and the anomaly list. The `Settlement` model and the `AnomalyRecord` model were added after the domain analysis, not before.

3. **Import pipeline (no DB)** — The importer was built as a pure-function pipeline (`engine.js`) with a CLI runner (`runImport.js`) first, before any database code was written. This allowed the entire anomaly detection engine to be tested against the real CSV without infrastructure.

4. **Iterative validation** — The command `node src/importer/runImport.js ../Expenses_Export.csv` was run repeatedly as each module was built. The output was compared manually against the raw CSV to catch missed anomalies or incorrect handling.

5. **DB persistence** — Once the pipeline was validated, `importService.js` and the Prisma integration were added. The pipeline result object's structure (`{ people, expenses, settlements, anomalies, summary }`) was designed to be directly consumable by the persistence layer.

6. **API routes and frontend** — Built after the import pipeline was validated end-to-end. The frontend is a thin React client that calls the backend API and renders the data.

7. **Documentation** — `SCOPE.md`, `DECISIONS.md`, and `AI_USAGE.md` were written after the implementation was complete, using the importer's actual output to populate the anomaly tables.

---

## Key Prompts Used (Representative Examples)

The following are representative of the prompts used throughout development:

> *"Here's the assignment email and a CSV export. Before we write any code, go through every row of the CSV and identify every data quality problem: inconsistencies, missing values, ambiguous fields, duplicates, anything that would need handling in an import pipeline."*

This produced the initial anomaly inventory. Claude identified the name casing variations, the percentage sums not adding to 100%, the ambiguous date, the two settlement-like rows, and the duplicate Marina Bites rows — all before the importer was written.

> *"Build the import engine as a pure function that takes a CSV path and returns a structured object with people, expenses, settlements, and anomalies. No database calls in the engine. Separate module for DB persistence. I need to be able to run it standalone against the CSV."*

This established the architectural separation of `engine.js` from `importService.js` and produced the `runImport.js` CLI runner.

> *"The percentage splits for rows 15 and 32 sum to 110%, not 100%. The importer is normalising them silently — I need an explicit PERCENTAGE_SUM_MISMATCH anomaly that shows the original percentages, the rescale factor applied, and a warning that the user should verify."*

This prompted the addition of the explicit anomaly logging that had been missing from the initial `calculateSplits()` implementation.

> *"Row 38 (Sam deposit share) has split_type = equal and split_with = Aisha, but it's clearly a settlement — Sam paying Aisha his move-in deposit. The current detection only catches empty split_type. Extend it to also check keywords in description/notes when split_with has exactly one other person."*

This extended the settlement detection heuristic to catch keyword-based cases.

> *"For the AI summary feature, the function must be entirely optional — if ANTHROPIC_API_KEY is not set or the API call fails for any reason, return null and let the Import Report render without the paragraph. Do not let AI failures block the import."*

This requirement was stated explicitly before the feature was implemented, which is why `summarizeAnomalies()` has two early-exit paths (missing key, API error) built in from the start.

---

## Validation Process

### Against Real Data
Every module was validated against the actual 42-row `Expenses_Export.csv`, not synthetic test cases. The CLI runner output (`node src/importer/runImport.js`) was compared line-by-line against the raw CSV to verify:
- Every anomaly detected is genuine
- No genuine anomaly is missed
- Balance calculations are arithmetically correct

### Manual Balance Verification
Final net balances were verified by manually tracing the arithmetic for each person:
- Sum of all expense amounts where `paidById = personId` (money in)
- Minus sum of all `amountOwedInInr` for that person across all included expense splits (money out)
- Plus/minus settlement adjustments

The CLI runner's built-in balance output (`=== NET BALANCES ===`) matched the manual calculation.

### Code Review
All AI-generated code was read and understood before committing. Logic for split calculation, duplicate detection, and settlement classification was traced through manually with the actual CSV rows to confirm correctness.

---

## Cases Where AI Suggestions Were Incorrect

### Case 1 — Tailwind v3 Setup on a Tailwind v4 Project

**Prompt given to AI:**
> "Set up the React frontend with Vite and Tailwind CSS. Configure PostCSS and create the initial CSS file."

**What the AI produced:**
```bash
npx tailwindcss init -p
```
Followed by `src/index.css` containing:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
And a `tailwind.config.js` file with a `content` array.

**Why it was wrong:**
The project had installed Tailwind CSS v4.3.1 via npm. Tailwind v4 completely removed the `init` CLI command, the `tailwind.config.js` file, and the `@tailwind base/components/utilities` directive syntax. These are Tailwind v3 patterns. Tailwind v4 uses a CSS-first configuration model where the entire setup lives in `index.css`.

**How it was detected:**
`npx tailwindcss init -p` threw:
```
npm error could not determine executable to run
```
Checking `node_modules/tailwindcss/package.json` confirmed `"version": "4.3.1"`. The v4 migration guide confirmed that `init` and `tailwind.config.js` were removed.

**Final fix:**
- Removed `tailwind.config.js` entirely
- Installed `@tailwindcss/postcss` (`npm install -D @tailwindcss/postcss autoprefixer`)
- Created `postcss.config.js`:
  ```javascript
  export default {
    plugins: {
      "@tailwindcss/postcss": {},
      autoprefixer: {},
    },
  };
  ```
- Replaced `index.css` with Tailwind v4 syntax:
  ```css
  @import "tailwindcss";

  @theme {
    --color-brand: #2563eb;
    --color-brand-dark: #1d4ed8;
    --color-positive: #16a34a;
    --color-negative: #dc2626;
  }
  ```

**Root cause:** The AI was trained on Tailwind v3 patterns. Tailwind v4 was released after the AI's knowledge cutoff (or was underrepresented in its training data). This is a common class of error when AI tools suggest setup commands for fast-moving packages.

---

### Case 2 — Percentage Split Rescaling Without an Anomaly Record

**Prompt given to AI:**
> "Implement the calculateSplits() function for all four split types: equal, percentage, share, and unequal."

**What the AI produced:**
For the PERCENTAGE case, the implementation divided each person's raw percentage by the sum of all percentages, multiplied by 100 to get a normalised percentage, then applied it to the expense amount. This correctly produced the right `amountOwedInInr` values for rows 15 and 32. However, it did so silently — no anomaly record was created for the fact that the percentages summed to 110%, not 100%.

**Why it was wrong:**
The percentage mismatch (30+30+30+20 = 110%) is a genuine data entry error in the source spreadsheet. The user who entered it may have intended different percentages. Silently rescaling without logging means:
1. The Import Report shows no issue for rows 15 and 32
2. SCOPE.md would be incomplete — a real anomaly would be hidden
3. The user has no visibility that their percentages were changed

**How it was detected:**
While writing SCOPE.md from the importer's anomaly output, the anomaly table had no entries for rows 15 or 32. A manual check of the raw CSV (`30+30+30+20 = 110`) made it obvious the mismatch was real. The importer's output showed the rescaled amounts (`Aisha: owes 392.73`) without any explanation of why.

**Final fix:**
Added explicit check in `calculateSplits()` before rescaling:
```javascript
const sum = details.reduce((acc, d) => acc + d.value, 0);
if (Math.abs(sum - 100) > 0.01) {
  anomalies.push({
    type: "PERCENTAGE_SUM_MISMATCH",
    description: `split_details percentages sum to ${sum}%, not 100%.`,
    action: `Percentages were proportionally re-scaled so they sum to 100% (each original % was multiplied by ${(100 / sum).toFixed(4)}).`,
  });
}
```
The rescaling still happens (it's the only sensible resolution), but now it is transparent, logged, and visible in the Import Report as a `WARNING`.

**Lesson:** AI implementations optimise for correctness of the output (correct amounts) without necessarily optimising for auditability of the process (is the transformation visible to the user). For a financial import tool, every automated transformation must be logged.

---

### Case 3 — Settlement Detection Missing Keyword-Based Cases

**Prompt given to AI:**
> "Detect which rows in the CSV are direct person-to-person settlements versus shared household expenses."

**What the AI produced:**
Detection logic that checked only for an empty `split_type` field:
```javascript
const looksLikeSettlement = rawSplitType === "" && otherParticipants.length === 1;
```

This correctly caught row 14 ("Rohan paid Aisha back" — `split_type` is empty).

**Why it was wrong:**
Row 38 ("Sam deposit share") has `split_type = "equal"` — it passed through as a regular 2-person equal expense. The result: Sam and Aisha each owed ₹7,500 (half of the ₹15,000), which is mathematically wrong. Row 38 is Sam handing Aisha his move-in deposit — a 1:1 transfer — not a shared cost where both people owe half.

**How it was detected:**
Reviewing the parsed expense list, row 38 appeared as:
```
Row 38: 2026-04-08 | Sam deposit share | paidBy=Sam | 15000 INR | EQUAL
    Sam: owes 7500 INR
    Aisha: owes 7500 INR
```
A ₹15,000 "deposit" expense with only 2 of 5+ household members and a notes field saying "Sam moving in! paid Aisha his deposit" — visually suspicious. Cross-referencing with the raw CSV confirmed it was misclassified.

**Final fix:**
Extended the detection heuristic with a keyword regex applied to `description + notes`:
```javascript
const SETTLEMENT_KEYWORDS = /deposit|paid.*back|reimburs|settle?ment|owes?/i;
const descriptionAndNotes = `${row.description || ""} ${row.notes || ""}`;

const looksLikeSettlement =
  (rawSplitType === "" || SETTLEMENT_KEYWORDS.test(descriptionAndNotes)) &&
  otherParticipants.length === 1 &&
  splitWith.length <= 2;
```
A `SETTLEMENT_DETECTED` anomaly is logged every time the heuristic fires, making the classification auditable. If a future row is misclassified, the anomaly log provides the evidence needed to identify and correct it.

**Lesson:** AI suggestions often handle the explicit, structured case (empty `split_type`) correctly while missing the implicit, semantic case (descriptive text indicating a transfer). Domain-specific edge cases require domain knowledge — the AI's initial solution was correct for the documented case, but the dataset contained an undocumented case that required human domain reasoning to identify.

---

## Lessons Learned

1. **Always validate against real data, not synthetic examples.** The percentage-mismatch case and the settlement misclassification were caught only because the importer was run against the actual 42-row CSV and its output was inspected manually. Synthetic unit tests would not have caught either error.

2. **Silent fixes are as dangerous as missed detections.** An automated correction that is not logged is, from the user's perspective, indistinguishable from the original data. Every transformation must produce a visible anomaly record.

3. **Version mismatches are a persistent AI risk.** Tailwind v3 vs v4, Prisma v5 vs v6 — AI tools have training cutoffs and may default to patterns from older major versions of fast-moving packages. Always verify setup commands against the installed package's `package.json`.

4. **AI excels at scaffolding and pattern implementation; domain reasoning is a human responsibility.** The AI implemented the structural detection pattern correctly but missed the semantic one. Understanding what constitutes a settlement in the context of a household ledger requires domain knowledge that the AI did not have.

5. **The iterative build-and-validate loop is essential.** A single prompt producing all the code would have shipped all three errors. The iterative workflow — implement module, run against real data, inspect output, identify gap, correct — produced a much more reliable result.

---

## Engineering Responsibility Statement

All AI-generated code in this project was read, understood, and manually validated before being committed. Where the AI produced incorrect or incomplete output, the error was identified through manual testing against the real dataset, the root cause was understood, and the code was corrected.

The engineering decisions in this project — the domain model (Settlement vs Expense), the two-tier duplicate strategy, the fail-safe import philosophy, the explicit alias table over fuzzy matching, the fixed FX rate with preserved originals — are human decisions made after reasoning through the tradeoffs, not AI suggestions accepted uncritically.

The developer takes full responsibility for the correctness of the codebase, the completeness of the anomaly detection, the accuracy of the documentation, and the architectural choices described in `DECISIONS.md`. AI was used as a productivity accelerator; the engineering judgement, validation process, and final implementation decisions are entirely the developer's own.
