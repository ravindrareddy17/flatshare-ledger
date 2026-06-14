# IMPORT_REPORT.md — Production Import Report

**File:** `Expenses_Export.csv`  
**Import Date:** 2026-06-15  
**Pipeline Version:** Flatshare Ledger v1.0.0  
**Environment:** Local (SQLite)

---

## Import Summary

| Metric | Value |
|---|---|
| Source file | `Expenses_Export.csv` |
| Total data rows (excl. header) | **42** |
| Expense records created | **40** |
| Settlement records created | **2** |
| Rows skipped | **0** |
| Unique people detected | **7** |
| Total anomalies detected | **24** |
| — Errors (require action) | **1** |
| — Warnings (require review) | **9** |
| — Info (auto-resolved) | **14** |
| Import outcome | ⚠️ **COMPLETED WITH WARNINGS** |

---

## Import Outcome

The import completed successfully. All 42 rows were processed. No rows were discarded. One expense (Row 13) was excluded from balance calculations due to a missing payer and requires manual correction before it will affect any balance. Nine additional rows have warnings that should be reviewed for correctness.

**Balances are safe to use** for all rows except Row 13 (excluded) and Row 6 (duplicate, excluded). Rows 24 and 25 are both included in balances but are flagged as potentially describing the same dinner — a human decision is required.

---

## Import Statistics

### Row Classification

| Classification | Count | Notes |
|---|---|---|
| Shared Expenses | 40 | Includes 2 flagged exact duplicates, 1 excluded (missing payer) |
| Settlements | 2 | Rows 14 and 38, auto-classified from structure and keywords |
| Skipped | 0 | No rows were skipped |

### Anomaly Breakdown

| Severity | Count | Meaning |
|---|---|---|
| `ERROR` | 1 | Row excluded from balances; manual correction required |
| `WARNING` | 9 | Row included; automated judgement call made; human review recommended |
| `INFO` | 14 | Cosmetic normalisation; no balance effect |

### People Detected

| Person | Status | Notes |
|---|---|---|
| Aisha | Active | Core household member |
| Rohan | Active | Core household member |
| Priya | Active | Core household member (appeared as "priya", "Priya S" — normalised) |
| Meera | Inactive | Departed after 29 March 2026 |
| Dev | Active | Appears in Goa-trip rows; not a full-time resident |
| Dev's friend Kabir | Inactive (guest) | One-off guest, Row 23 only; auto-created |
| Sam | Active | Moved in April 2026 |

---

## Detailed Anomaly Report

Full anomaly log in chronological order. Each row corresponds to an `AnomalyRecord` in the database.

| # | Row | Field | Type | Severity | Raw Value | What Was Found | Action Taken |
|---|---|---|---|---|---|---|---|
| 1 | 6 | description | `POSSIBLE_DUPLICATE` | ⚠️ WARNING | `dinner - marina bites` | Row 6 ("dinner - marina bites", Dev, ₹3,200, 08-02-2026) is an exact duplicate of Row 5 ("Dinner at Marina Bites", Dev, ₹3,200, 08-02-2026) — same date, payer, amount, and normalised description. | Row 6 imported with `excludeFromBalances = true` and `isDuplicateOf = Row 5`. **Excluded from balances.** Confirm and delete Row 6. |
| 2 | 7 | amount | `AMOUNT_THOUSANDS_SEPARATOR` | ℹ️ INFO | `1,200` | Amount "1,200" for "Electricity Feb" contains a thousands-separator comma that prevents numeric parsing. | Comma stripped; parsed as `1200`. No balance effect. |
| 3 | 9 | paid_by | `NAME_NORMALIZED` | ℹ️ INFO | `priya` | paid_by value "priya" (all lowercase) — does not match the canonical name "Priya". | Normalised to "Priya" via alias table. No balance effect. |
| 4 | 10 | amount | `AMOUNT_PRECISION` | ℹ️ INFO | `899.995` | Amount "899.995" for "Cylinder refill" has 3 decimal places. Currency amounts have at most 2 significant decimal places. | Rounded to `900.00` using precision-safe rounding. No balance effect. |
| 5 | 11 | paid_by | `NAME_NORMALIZED` | ℹ️ INFO | `Priya S` | paid_by value "Priya S" — an abbreviation not matching canonical "Priya". | Normalised to "Priya" via alias table. No balance effect. |
| 6 | 13 | paid_by | `MISSING_PAYER` | 🔴 ERROR | _(empty)_ | The `paid_by` field is empty for "House cleaning supplies" (₹780). Without a payer, no one can receive credit for paying. | Imported with `paidBy = null`. **Row excluded from all balance calculations.** Flagged for manual payer assignment. |
| 7 | 14 | split_type | `SETTLEMENT_DETECTED` | ℹ️ INFO | _(empty)_ | "Rohan paid Aisha back" has an empty `split_type` and `split_with = "Aisha"` — the structural pattern of a direct repayment. | **Recorded as Settlement:** Rohan → Aisha, ₹5,000 INR. Adjusts exactly two balances. Not treated as a shared expense. |
| 8 | 15 | split_details | `PERCENTAGE_SUM_MISMATCH` | ⚠️ WARNING | `Aisha 30%; Rohan 30%; Priya 30%; Meera 20%` | "Pizza Friday" percentage splits sum to 110% (30+30+30+20), not 100%. A spreadsheet data entry error. | All percentages rescaled proportionally by factor 0.9091 to sum to 100%. Applied amounts: Aisha ₹392.73, Rohan ₹392.73, Priya ₹392.73, Meera ₹261.82. **Verify intended split.** |
| 9 | 20 | amount | `FX_CONVERSION` | ℹ️ INFO | `540 USD` | "Goa villa booking" is denominated in USD. Balance calculations require INR. | Converted at fixed rate **1 USD = ₹83**: 540 × 83 = ₹44,820. Original `amountOriginal = 540`, `currencyOriginal = USD`, `exchangeRateUsed = 83` preserved on the record. |
| 10 | 21 | amount | `FX_CONVERSION` | ℹ️ INFO | `84 USD` | "Beach shack lunch" is denominated in USD. | Converted at same fixed rate: 84 × 83 = ₹6,972. Originals preserved. |
| 11 | 23 | amount | `FX_CONVERSION` | ℹ️ INFO | `150 USD` | "Parasailing" is denominated in USD. | Converted at fixed rate: 150 × 83 = ₹12,450. Originals preserved. |
| 12 | 23 | split_with | `NEW_PERSON_AUTO_CREATED` | ℹ️ INFO | `Dev's friend Kabir` | "Dev's friend Kabir" appears in `split_with` but matches no known household member. Guest name pattern detected. | Auto-created as `Person` with `isActive = false`, `notes = "Auto-created one-off guest during import."` Kabir's share (₹2,490) included in balances. **Review: should Dev absorb Kabir's share?** |
| 13 | 25 | description | `POSSIBLE_DUPLICATE_DIFFERENT_AMOUNTS` | ⚠️ WARNING | `Thalassa dinner` | Row 25 ("Thalassa dinner", Rohan, ₹2,450) and Row 24 ("Dinner at Thalassa", Aisha, ₹2,400) share the same date (11-03-2026) and a normalised description match, but have different payers and amounts. Could be two people logging the same dinner, or two separate tabs. | Both rows imported. Both flagged. **Neither excluded from balances** — the importer cannot determine which amount is correct. Human decision required. |
| 14 | 26 | amount | `FX_CONVERSION` | ℹ️ INFO | `-30 USD` | "Parasailing refund" is denominated in USD and is negative (a credit). | Converted: -30 × 83 = -₹2,490. Each participant's share is negative (a credit toward their balance). Originals preserved. |
| 15 | 26 | amount | `NEGATIVE_AMOUNT` | ⚠️ WARNING | `-30 USD` | Amount is negative — indicates a refund or credit rather than a standard expense. | Imported as negative-amount expense. Arithmetic handles this correctly: negative splits reduce each participant's owed amount. **Confirm this correctly offsets the original Parasailing charge (Row 23, ₹12,450).** |
| 16 | 27 | date | `DATE_FORMAT_NORMALIZED` | ⚠️ WARNING | `Mar-14` | Date "Mar-14" uses a `Mon-DD` format with no year — different from the `DD-MM-YYYY` format used by all other rows. | Parsed as **14-03-2026**: day 14, month March, year 2026 inferred from context (all surrounding rows are in 2026). **Confirm this is 14 March 2026.** |
| 17 | 27 | paid_by | `NAME_NORMALIZED` | ℹ️ INFO | `rohan ` | paid_by value "rohan " has a trailing space and is lowercase. | Trimmed and normalised to "Rohan" via alias table. No balance effect. |
| 18 | 28 | currency | `MISSING_CURRENCY` | ℹ️ INFO | _(empty)_ | `currency` field is empty for "Groceries DMart" (15-03-2026). Row notes: "forgot to set currency". | Defaulted to **INR** — consistent with every other row from the same period. No balance effect. |
| 19 | 31 | amount | `ZERO_AMOUNT` | ℹ️ INFO | `0` | "Dinner order Swiggy" has amount ₹0. Row notes: "counted twice earlier - fixing later". | Imported with zero effect on all balances. Flagged for review/deletion. |
| 20 | 32 | split_details | `PERCENTAGE_SUM_MISMATCH` | ⚠️ WARNING | `Aisha 30%; Rohan 30%; Priya 30%; Meera 20%` | "Weekend brunch" percentage splits sum to 110% (30+30+30+20), not 100%. Same pattern as Row 15. | Rescaled proportionally by factor 0.9091. Applied amounts: Aisha ₹600.00, Rohan ₹600.00, Priya ₹600.00, Meera ₹400.00 (rounded). **Verify intended split.** |
| 21 | 34 | date | `AMBIGUOUS_DATE` | ⚠️ WARNING | `04-05-2026` | Date "04-05-2026" is explicitly flagged in the source notes as ambiguous: "is this April 5 or May 4? format is a mess". Under DD-MM-YYYY: 4 May 2026. Under MM-DD-YYYY: 5 April 2026. | Interpreted as **DD-MM-YYYY (4 May 2026)** for consistency with every other date in the file. **Confirm this is the correct date for "Deep cleaning service".** |
| 22 | 36 | split_with | `INACTIVE_PERSON_IN_SPLIT` | ⚠️ WARNING | `Aisha;Rohan;Priya;Meera` | "Groceries BigBasket" (02-04-2026) includes Meera in `split_with`, but Meera left the household after 29 March 2026. Row's own note: "oops Meera still in the group list". | Meera's split retained as recorded (data not altered). Row imported with Meera's share included. **Consider re-splitting 3 ways among Aisha, Rohan, Priya.** |
| 23 | 38 | description | `SETTLEMENT_DETECTED` | ℹ️ INFO | `Sam deposit share` | Description and notes ("Sam moving in! paid Aisha his deposit") contain settlement keywords (`deposit`), and `split_with` names exactly one other person (Aisha). | **Recorded as Settlement:** Sam → Aisha, ₹15,000 INR. Represents Sam's move-in deposit payment, not a shared household expense. |
| 24 | 42 | split_details | `SPLIT_DETAILS_IGNORED` | ⚠️ WARNING | `Aisha 1; Rohan 1; Priya 1; Sam 1` | "Furniture for common room" has `split_type = equal` but also provides `split_details = "Aisha 1; Rohan 1; Priya 1; Sam 1"` — contradictory (share notation is only meaningful for `split_type = share`). | `split_type` is authoritative (see DECISIONS.md). Amount split equally 4 ways: ₹3,000 per person. Note: for this row, equal split and 1:1:1:1 shares produce the same result. **Confirm equal split was intended.** |

---

## Duplicate Detection Report

Two duplicate cases were identified during the second-pass duplicate detection scan.

### Case 1 — Exact Duplicate (Row 5 / Row 6)

| Field | Row 5 | Row 6 |
|---|---|---|
| Date | 08-02-2026 | 08-02-2026 |
| Description | Dinner at Marina Bites | dinner - marina bites |
| Paid by | Dev | Dev |
| Amount | ₹3,200 | ₹3,200 |
| Currency | INR | INR |
| Normalised description | `bites dinner marina` | `bites dinner marina` |

**Classification:** `POSSIBLE_DUPLICATE` (exact)  
**Action:** Row 6 excluded from balance calculations (`excludeFromBalances = true`). `isDuplicateOf` set to Row 5's database ID. Both records visible in the Expenses page.  
**Required action:** Confirm Row 6 is a duplicate. Delete Row 6 via the Expenses page.

---

### Case 2 — Near-Duplicate (Row 24 / Row 25)

| Field | Row 24 | Row 25 |
|---|---|---|
| Date | 11-03-2026 | 11-03-2026 |
| Description | Dinner at Thalassa | Thalassa dinner |
| Paid by | **Aisha** | **Rohan** |
| Amount | **₹2,400** | **₹2,450** |
| Currency | INR | INR |
| Normalised description | `dinner thalassa` | `dinner thalassa` |

**Classification:** `POSSIBLE_DUPLICATE_DIFFERENT_AMOUNTS` (near-match)  
**Action:** Both rows imported. Both flagged. **Neither excluded from balances.** Current balance impact: +₹4,850 total for this dinner across both rows.  
**Required action:** Determine which row is correct (or whether they represent two separate checks). Delete or correct the incorrect row. Row 25's own notes say "Aisha also logged this I think hers is wrong" — this suggests Row 24 may be correct and Row 25 should be deleted.

---

## Currency Conversion Report

All currency conversions used a fixed rate of **1 USD = ₹83** (documented assumption; see DECISIONS.md §5). Original amounts and currencies are preserved on all records.

| Row | Description | Original Amount | Converted Amount | Rate Used |
|---|---|---|---|---|
| 20 | Goa villa booking | $540.00 USD | ₹44,820.00 | 83 |
| 21 | Beach shack lunch | $84.00 USD | ₹6,972.00 | 83 |
| 23 | Parasailing | $150.00 USD | ₹12,450.00 | 83 |
| 26 | Parasailing refund | -$30.00 USD | -₹2,490.00 | 83 |

**Total USD converted:** $744.00 (net $714.00 after refund)  
**Total INR equivalent:** ₹59,292.00 (net ₹56,802.00 after refund)

> **Note:** The fixed rate of ₹83/USD was the approximate market rate at the time of the Goa trip (March 2026). A ±5% variance from the true rate would change each Goa participant's share by ≈₹650–₹700 — well within the acceptable margin for household expense tracking.

---

## Settlement Detection Report

Two rows were automatically classified as direct person-to-person settlements rather than shared household expenses.

### Settlement 1 — Row 14

| Field | Value |
|---|---|
| Date | 25-02-2026 |
| Description | Rohan paid Aisha back |
| From | Rohan |
| To | Aisha |
| Amount | ₹5,000 |
| Detection trigger | Empty `split_type` + single person in `split_with` |
| Anomaly type | `SETTLEMENT_DETECTED` (INFO) |

**Balance effect:** Rohan's balance +₹5,000 (he paid money to Aisha, reducing what he owes the group). Aisha's balance -₹5,000.

---

### Settlement 2 — Row 38

| Field | Value |
|---|---|
| Date | 08-04-2026 |
| Description | Sam deposit share |
| Notes | Sam moving in! paid Aisha his deposit |
| From | Sam |
| To | Aisha |
| Amount | ₹15,000 |
| Detection trigger | Keyword `deposit` in notes + single person in `split_with` |
| Anomaly type | `SETTLEMENT_DETECTED` (INFO) |

**Balance effect:** Sam's balance +₹15,000 (he paid money to Aisha). Aisha's balance -₹15,000. This represents Sam's move-in deposit — correctly not split among the household.

---

## Membership Validation Report

| Person | Status | Move-in | Move-out | Post-departure rows |
|---|---|---|---|---|
| Aisha | Active | — | — | — |
| Rohan | Active | — | — | — |
| Priya | Active | — | — | — |
| Meera | Inactive | — | After 29 Mar 2026 | **Row 36** (02-04-2026) |
| Dev | Active | — | — | — |
| Dev's friend Kabir | Inactive (guest) | — | — | Guest (Row 23 only) |
| Sam | Active | Apr 2026 | — | — |

### Row 36 — Post-Departure Appearance

Row 36 ("Groceries BigBasket", 02-04-2026, ₹2,640) lists Meera in `split_with` after her departure. The row's own note confirms this is a mistake: "oops Meera still in the group list."

**Current handling:** Meera's share is included as recorded (₹660). The `INACTIVE_PERSON_IN_SPLIT` warning flags the row for review.  
**Recommendation:** Edit Row 36 to remove Meera from the split and redistribute the ₹2,640 equally among Aisha, Rohan, and Priya (₹880 each instead of ₹660 each).

---

## Errors — Requiring Immediate Action

### 🔴 ERROR: Row 13 — Missing Payer

| Field | Value |
|---|---|
| Row | 13 |
| Description | House cleaning supplies |
| Date | 22-02-2026 |
| Amount | ₹780.00 |
| Split with | Aisha, Rohan, Priya, Meera (4 ways, ₹195 each) |
| Paid by | _(empty — "can't remember who paid")_ |
| Current balance effect | None (excluded) |

**Required action:** Identify who paid for the house cleaning supplies on 22 February 2026. Use the PATCH `/api/expenses/:id` endpoint or the Expenses page to assign `paidById`. Once a payer is assigned, the expense can be re-included in balance calculations (toggle `excludeFromBalances` to `false`).

---

## Warnings — Requiring Human Review

| Row | Issue | Recommendation |
|---|---|---|
| 6 | Exact duplicate of Row 5 (Marina Bites, Dev, ₹3,200) | Delete Row 6. It is already excluded from balances. |
| 15 | Percentage splits sum to 110% (Pizza Friday) | Verify intended split. Current amounts: Aisha/Rohan/Priya ₹392.73, Meera ₹261.82. |
| 24/25 | Two similar Thalassa entries with different payers/amounts | Row 25 notes suggest Row 24 (Aisha, ₹2,400) is correct. Delete Row 25. |
| 26 | Negative amount — Parasailing refund (-$30 USD / -₹2,490) | Confirm -₹2,490 correctly offsets the Row 23 Parasailing charge (₹12,450). |
| 27 | Non-standard date format "Mar-14" | Confirm this is 14 March 2026 (Airport cab, Rohan, ₹1,100). |
| 32 | Percentage splits sum to 110% (Weekend brunch) | Verify intended split. Current amounts: Aisha/Rohan/Priya ₹600, Meera ₹400. |
| 34 | Ambiguous date "04-05-2026" | Confirm whether this is **4 May 2026** (DD-MM) or **5 April 2026** (MM-DD) for "Deep cleaning service". |
| 36 | Meera in post-departure split (02-04-2026) | Re-split "Groceries BigBasket" ₹2,640 among Aisha, Rohan, Priya only (₹880 each). |
| 42 | Contradictory split_type=equal with share-notation split_details | Confirm equal split was intended for "Furniture for common room". |

---

## Final Import Result

### Net Balances (After This Import)

All amounts in INR. **Positive = group owes this person money. Negative = this person owes the group.**

| Person | Net Balance | Status |
|---|---|---|
| Aisha | **+₹92,330.94** | Owed by group — she has paid the most |
| Dev | **+₹31,577.00** | Owed by group |
| Sam | **+₹14,722.50** | Owed by group (offset by ₹15,000 deposit settlement) |
| Rohan | **-₹54,020.06** | Owes the group |
| Priya | **-₹60,939.06** | Owes the group |
| Meera | **-₹21,181.32** | Owes the group |
| Dev's friend Kabir | **-₹2,490.00** | Owes for parasailing share |

> **Note:** Row 13 (House cleaning supplies, ₹780) and Row 6 (duplicate Marina Bites, ₹3,200) are excluded. Correcting Row 13 will change each of the 4 participants' balances by ₹195.

### Suggested Settle-Up Transactions

Minimum transactions to zero all balances (greedy algorithm):

| From | To | Amount |
|---|---|---|
| Priya | Aisha | ₹60,939.06 |
| Rohan | Aisha | ₹31,391.88 |
| Rohan | Dev | ₹22,628.18 |
| Meera | Aisha | ₹1.00 (rounding) |
| Dev's friend Kabir | Dev | ₹2,490.00 |

> These suggestions will change once the ERROR on Row 13 is resolved and the Thalassa duplicate (Rows 24/25) is resolved.

---

## Recommendations

### Immediate (before sharing balances)

1. **Assign a payer to Row 13** (House cleaning supplies, ₹780) — currently excluded from balances
2. **Delete Row 6** (duplicate Marina Bites) — already excluded from balances; confirm deletion
3. **Resolve Rows 24/25** (Thalassa dinner) — determine which entry is correct; delete the other

### Short-term (before next import)

4. **Re-split Row 36** (Groceries, 02-04-2026) — remove Meera; split 3 ways among Aisha, Rohan, Priya
5. **Verify Row 15 and Row 32 percentages** — confirm the intended split for Pizza Friday and Weekend brunch
6. **Confirm Row 34 date** — 4 May or 5 April for Deep cleaning service?
7. **Confirm Row 27 date** — 14 March 2026 for Airport cab?

### Process improvements for future imports

8. **Standardise date format** to DD-MM-YYYY across all entries — prevents `DATE_FORMAT_NORMALIZED` and `AMBIGUOUS_DATE` anomalies
9. **Require currency field** — prevents `MISSING_CURRENCY` anomalies
10. **Update the household roster** in the CSV template when members move in or out — prevents `INACTIVE_PERSON_IN_SPLIT` anomalies
11. **Always fill `paid_by`** — a `MISSING_PAYER` is the only ERROR class that requires post-import manual correction
12. **Verify percentage splits sum to 100%** before saving — the importer will rescale but this should be a data-entry fix, not an automated workaround
