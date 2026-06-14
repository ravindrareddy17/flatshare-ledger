const fs = require("fs");
const { parse } = require("csv-parse/sync");

const { normalizePersonName, parseSplitWith } = require("./names");
const { parseDate } = require("./dates");
const { parseAmount, convertToInr, resolveCurrency, roundCurrency } = require("./amounts");
const { calculateSplits } = require("./splits");
const { severityOf } = require("./severity");

// People known to have left the household after a given date. Used to flag
// rows where they're still listed in split_with. See DECISIONS.md -
// "Household roster / membership drift".
const ROSTER_DEPARTURES = [
  { person: "Meera", leftAfter: new Date(Date.UTC(2026, 2, 29)) }, // 29 Mar 2026
];

// Description/notes keywords that, combined with a single non-payer in
// split_with, indicate a person-to-person transfer rather than a shared
// household expense. See DECISIONS.md - "Settlement detection".
const SETTLEMENT_KEYWORDS = /deposit|paid.*back|reimburs|settle?ment|owes?/i;

const SPLIT_TYPE_MAP = {
  equal: "EQUAL",
  percentage: "PERCENTAGE",
  share: "SHARE",
  unequal: "UNEQUAL",
};

/**
 * Runs the full import pipeline over a CSV file.
 *
 * @param {string} csvPath
 * @returns {{
 *   people: string[],
 *   expenses: Array<object>,
 *   settlements: Array<object>,
 *   anomalies: Array<object>,
 *   summary: object
 * }}
 */
function runImport(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: false });

  const people = new Set();
  const expenses = [];
  const settlements = [];
  const anomalies = [];

  const addAnomaly = (sourceRow, field, a) => {
    anomalies.push({
      sourceRow,
      field,
      type: a.type,
      severity: severityOf(a.type),
      rawValue: a.rawValue ?? null,
      description: a.description,
      action: a.action,
    });
  };

  rows.forEach((row, idx) => {
    // +2: 1 for the header row, 1 because idx is 0-based
    const sourceRow = idx + 2;

    // ---- Date -----------------------------------------------------------
    const { date, anomaly: dateAnomaly } = parseDate(row.date);
    if (dateAnomaly) addAnomaly(sourceRow, "date", { ...dateAnomaly, rawValue: row.date });

    // ---- Payer ------------------------------------------------------------
    let paidByName = null;
    if (row.paid_by && row.paid_by.trim() !== "") {
      const { canonical, wasNormalized, originalTrimmed } = normalizePersonName(row.paid_by);
      paidByName = canonical;
      people.add(canonical);
      if (wasNormalized) {
        addAnomaly(sourceRow, "paid_by", {
          type: "NAME_NORMALIZED",
          rawValue: row.paid_by,
          description: `paid_by value "${originalTrimmed}" normalised to "${canonical}".`,
          action: `Used canonical name "${canonical}".`,
        });
      }
    } else {
      addAnomaly(sourceRow, "paid_by", {
        type: "MISSING_PAYER",
        rawValue: row.paid_by,
        description: "The paid_by field is empty.",
        action: "Row imported with paidBy=null and excluded from balance calculations; flagged for manual assignment.",
      });
    }

    // ---- Amount + currency -------------------------------------------------
    const { value: amountOriginal, anomaly: amountAnomaly } = parseAmount(row.amount);
    if (amountAnomaly) addAnomaly(sourceRow, "amount", { ...amountAnomaly, rawValue: row.amount });

    const { currency: currencyOriginal, anomaly: currencyAnomaly } = resolveCurrency(row.currency);
    if (currencyAnomaly) addAnomaly(sourceRow, "currency", { ...currencyAnomaly, rawValue: row.currency });

    const { amountInInr, exchangeRateUsed, anomaly: fxAnomaly } = convertToInr(amountOriginal, currencyOriginal);
    if (fxAnomaly) addAnomaly(sourceRow, "amount", { ...fxAnomaly, rawValue: row.amount });

    if (amountOriginal < 0) {
      addAnomaly(sourceRow, "amount", {
        type: "NEGATIVE_AMOUNT",
        rawValue: row.amount,
        description: `Amount is negative (${amountOriginal} ${currencyOriginal}), suggesting a refund/credit.`,
        action: "Imported as a negative-amount expense, which reduces each participant's amount owed for this row accordingly. Flagged for manual confirmation that it correctly offsets the original charge.",
      });
    } else if (amountOriginal === 0) {
      addAnomaly(sourceRow, "amount", {
        type: "ZERO_AMOUNT",
        rawValue: row.amount,
        description: "Amount is 0.",
        action: "Imported with no effect on balances; flagged for manual review.",
      });
    }

    // ---- split_with ---------------------------------------------------------
    const { names: splitWith, anomalies: nameAnomalies } = parseSplitWith(row.split_with);
    nameAnomalies.forEach(({ rawValue, canonical }) =>
      addAnomaly(sourceRow, "split_with", {
        type: "NAME_NORMALIZED",
        rawValue,
        description: `split_with value "${rawValue}" normalised to "${canonical}".`,
        action: `Used canonical name "${canonical}".`,
      })
    );
    splitWith.forEach((name) => {
      const isKnown = people.has(name);
      people.add(name);
      if (!isKnown && name !== paidByName) {
        // Could be a brand-new person we haven't seen as a payer yet.
        // We only flag it as "auto-created" if it really looks like a
        // one-off (e.g. contains an apostrophe / multiple words like
        // "Dev's friend Kabir").
        if (/'s |friend|guest/i.test(name)) {
          addAnomaly(sourceRow, "split_with", {
            type: "NEW_PERSON_AUTO_CREATED",
            rawValue: name,
            description: `"${name}" does not match any known household member.`,
            action: `Auto-created as a one-off guest Person record (isActive=false). Review whether this person's share should instead be absorbed by whoever invited them.`,
          });
        }
      }
    });

    // ---- Roster / membership drift -------------------------------------------
    if (!Number.isNaN(date.getTime())) {
      for (const departure of ROSTER_DEPARTURES) {
        if (splitWith.includes(departure.person) && date > departure.leftAfter) {
          addAnomaly(sourceRow, "split_with", {
            type: "INACTIVE_PERSON_IN_SPLIT",
            rawValue: row.split_with,
            description: `"${departure.person}" is listed in split_with but appears to have left the household before this date.`,
            action: `Retained "${departure.person}" in the split as recorded (data not altered). Flagged for manual review of whether the cost should instead be split among the remaining ${splitWith.length - 1} people.`,
          });
        }
      }
    }

    // ---- Classify: settlement vs expense ----------------------------------
    const rawSplitType = (row.split_type || "").trim().toLowerCase();
    const descriptionAndNotes = `${row.description || ""} ${row.notes || ""}`;
    const otherParticipants = splitWith.filter((n) => n !== paidByName);

    const looksLikeSettlement =
      (rawSplitType === "" || SETTLEMENT_KEYWORDS.test(descriptionAndNotes)) &&
      otherParticipants.length === 1 &&
      splitWith.length <= 2;

    if (looksLikeSettlement) {
      if (rawSplitType === "") {
        addAnomaly(sourceRow, "split_type", {
          type: "SETTLEMENT_DETECTED",
          rawValue: row.split_type,
          description: `split_type was empty and split_with names a single other person ("${otherParticipants[0]}"), matching the pattern of a direct payment/settlement rather than a shared expense.`,
          action: `Recorded as a Settlement: ${paidByName} -> ${otherParticipants[0]}, ${amountInInr} INR.`,
        });
      } else {
        addAnomaly(sourceRow, "description", {
          type: "SETTLEMENT_DETECTED",
          rawValue: row.description,
          description: `Description/notes ("${descriptionAndNotes.trim()}") indicate a direct payment/transfer rather than a shared household expense.`,
          action: `Recorded as a Settlement: ${paidByName} -> ${otherParticipants[0]}, ${amountInInr} INR.`,
        });
      }

      settlements.push({
        sourceRow,
        date,
        notes: row.notes || row.description || null,
        fromPerson: paidByName,
        toPerson: otherParticipants[0],
        amountOriginal,
        currencyOriginal,
        amountInInr,
        exchangeRateUsed,
      });
      return; // done with this row
    }

    // ---- Regular expense -----------------------------------------------------
    const splitType = SPLIT_TYPE_MAP[rawSplitType];
    if (!splitType) {
      addAnomaly(sourceRow, "split_type", {
        type: "UNKNOWN_SPLIT_TYPE",
        rawValue: row.split_type,
        description: `Unrecognised split_type value "${row.split_type}".`,
        action: "Fell back to an equal split across split_with; flagged for manual review.",
      });
    }

    const { splits, anomalies: splitAnomalies } = calculateSplits({
      splitType: splitType || "EQUAL",
      splitWith,
      splitDetailsRaw: row.split_details,
      amountInInr,
    });
    splitAnomalies.forEach((a) => addAnomaly(sourceRow, "split_details", { ...a, rawValue: row.split_details }));

    const excludeFromBalances =
      anomalies.some(
        (a) =>
          a.sourceRow === sourceRow &&
          a.severity === "ERROR" &&
          ["MISSING_PAYER", "EMPTY_SPLIT_WITH", "UNPARSEABLE_AMOUNT", "UNPARSEABLE_DATE"].includes(a.type)
      );

    expenses.push({
      sourceRow,
      date,
      description: (row.description || "").trim(),
      notes: row.notes || null,
      paidBy: paidByName,
      amountOriginal,
      currencyOriginal,
      amountInInr,
      exchangeRateUsed,
      splitType: splitType || "EQUAL",
      splits,
      flagged: false, // set true below if duplicate-flagged
      excludeFromBalances,
      isDuplicateOf: null,
    });
  });

  // ---- Duplicate detection (second pass, needs full expense list) -----------
  detectDuplicates(expenses, anomalies, addAnomaly);

  const summary = {
    totalRows: rows.length,
    expenseCount: expenses.length,
    settlementCount: settlements.length,
    skippedCount: 0,
    anomalyCount: anomalies.length,
  };

  return { people: [...people], expenses, settlements, anomalies, summary };
}

/**
 * Normalises a description for fuzzy duplicate matching: lowercase, strip
 * punctuation, drop common filler words, sort the remaining words.
 */
function normalizeDescription(desc) {
  const FILLER = new Set(["at", "the", "a", "an", "-"]);
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .sort()
    .join(" ");
}

function detectDuplicates(expenses, anomalies, addAnomaly) {
  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i];
      const b = expenses[j];

      if (a.date.getTime() !== b.date.getTime() || Number.isNaN(a.date.getTime())) continue;

      const normA = normalizeDescription(a.description);
      const normB = normalizeDescription(b.description);
      if (normA !== normB || normA === "") continue;

      const sameAmountAndPayer =
        a.paidBy === b.paidBy &&
        a.amountOriginal === b.amountOriginal &&
        a.currencyOriginal === b.currencyOriginal;

      if (sameAmountAndPayer) {
        b.flagged = true;
        b.isDuplicateOf = a.sourceRow;
        b.excludeFromBalances = true;
        addAnomaly(b.sourceRow, "description", {
          type: "POSSIBLE_DUPLICATE",
          rawValue: b.description,
          description: `Row ${b.sourceRow} ("${b.description}") looks like a duplicate of row ${a.sourceRow} ("${a.description}") - same date, payer, and amount.`,
          action: `Both rows imported, but row ${b.sourceRow} is excluded from balance totals and flagged as a likely duplicate. Confirm before deleting.`,
        });
      } else {
        a.flagged = true;
        b.flagged = true;
        addAnomaly(b.sourceRow, "description", {
          type: "POSSIBLE_DUPLICATE_DIFFERENT_AMOUNTS",
          rawValue: b.description,
          description: `Row ${b.sourceRow} ("${b.description}", ${b.paidBy}, ${b.amountOriginal}) looks like it might describe the same event as row ${a.sourceRow} ("${a.description}", ${a.paidBy}, ${a.amountOriginal}) - same date, similar description, but different payer/amount.`,
          action: "Both rows imported and both flagged for manual review; the importer did not guess which (if either) is correct.",
        });
      }
    }
  }
}

/**
 * True if a name looks like a one-off guest rather than a regular household
 * member (used by importService to set Person.isActive = false on create).
 */
function isOneOffGuest(name) {
  return /'s |friend|guest/i.test(name);
}

module.exports = { runImport, ROSTER_DEPARTURES, isOneOffGuest };
