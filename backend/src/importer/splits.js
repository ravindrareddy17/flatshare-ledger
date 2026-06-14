const { parseSplitWith } = require("./names");
const { roundCurrency } = require("./amounts");

/**
 * Parses a "split_details" cell of the form "Name X; Name Y; ..." where X/Y
 * may be plain numbers, "N%" percentages, or share counts.
 *
 * @param {string} raw
 * @returns {Array<{ name: string, value: number }>}
 */
function parseSplitDetails(raw) {
  if (!raw) return [];
  return String(raw)
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const match = /^(.+?)\s+([\d.]+)\s*%?$/.exec(part);
      if (!match) return null;
      const [, namePart, numPart] = match;
      return { name: namePart.trim(), value: parseFloat(numPart) };
    })
    .filter(Boolean);
}

/**
 * Computes per-person owed amounts (in INR) for an expense.
 *
 * @param {object} params
 * @param {"EQUAL"|"PERCENTAGE"|"SHARE"|"UNEQUAL"} params.splitType
 * @param {string[]} params.splitWith - canonical participant names
 * @param {string} params.splitDetailsRaw - raw split_details cell
 * @param {number} params.amountInInr
 * @returns {{
 *   splits: Array<{ personName: string, shareValue: number|null, amountOwedInInr: number }>,
 *   anomalies: Array<{ type: string, description: string, action: string }>
 * }}
 */
function calculateSplits({ splitType, splitWith, splitDetailsRaw, amountInInr }) {
  const anomalies = [];
  const details = parseSplitDetails(splitDetailsRaw);

  // Normalize detail names the same way split_with names are normalized,
  // so "Priya 400" lines up with the canonical "Priya".
  const normalizedDetails = details.map((d) => ({
    ...parseSplitWithSingle(d.name),
    value: d.value,
  }));

  if (splitWith.length === 0) {
    anomalies.push({
      type: "EMPTY_SPLIT_WITH",
      description: "split_with is empty for an expense with a non-zero amount.",
      action: "No splits created; expense excluded from balance calculations and flagged for manual review.",
    });
    return { splits: [], anomalies };
  }

  switch (splitType) {
    case "EQUAL": {
      if (details.length > 0) {
        anomalies.push({
          type: "SPLIT_DETAILS_IGNORED",
          description:
            'split_type is "equal" but split_details was also provided, which is contradictory.',
          action:
            "split_type was treated as authoritative (per DECISIONS.md); split_details ignored and the amount was divided equally among split_with.",
        });
      }
      const each = roundCurrency(amountInInr / splitWith.length);
      const splits = splitWith.map((personName) => ({
        personName,
        shareValue: null,
        amountOwedInInr: each,
      }));
      return { splits, anomalies };
    }

    case "PERCENTAGE": {
      const total = normalizedDetails.reduce((sum, d) => sum + d.value, 0);
      if (Math.abs(total - 100) > 0.001) {
        anomalies.push({
          type: "PERCENTAGE_SUM_MISMATCH",
          description: `split_details percentages sum to ${total}%, not 100%.`,
          action: `Percentages were proportionally re-scaled so they sum to 100% (each original % was multiplied by ${(100 / total).toFixed(4)}).`,
        });
      }

      const splits = normalizedDetails.map((d) => {
        const normalizedPct = (d.value / total) * 100;
        return {
          personName: d.canonical,
          shareValue: roundCurrency(d.value),
          amountOwedInInr: roundCurrency((normalizedPct / 100) * amountInInr),
        };
      });

      checkForMissingOrExtraNames(splitWith, splits, anomalies);
      return { splits, anomalies };
    }

    case "SHARE": {
      const totalShares = normalizedDetails.reduce((sum, d) => sum + d.value, 0);
      if (totalShares === 0) {
        anomalies.push({
          type: "SHARE_TOTAL_ZERO",
          description: "split_details for a 'share' split sums to 0.",
          action: "Fell back to an equal split across split_with; flagged for manual review.",
        });
        const each = roundCurrency(amountInInr / splitWith.length);
        return {
          splits: splitWith.map((personName) => ({
            personName,
            shareValue: null,
            amountOwedInInr: each,
          })),
          anomalies,
        };
      }

      const splits = normalizedDetails.map((d) => ({
        personName: d.canonical,
        shareValue: d.value,
        amountOwedInInr: roundCurrency((d.value / totalShares) * amountInInr),
      }));

      checkForMissingOrExtraNames(splitWith, splits, anomalies);
      return { splits, anomalies };
    }

    case "UNEQUAL": {
      const total = normalizedDetails.reduce((sum, d) => sum + d.value, 0);
      if (Math.abs(total - amountInInr) > 0.01) {
        anomalies.push({
          type: "UNEQUAL_SUM_MISMATCH",
          description: `split_details amounts sum to ${roundCurrency(total)}, which does not match the expense amount (${amountInInr}).`,
          action: "Imported as-given (per-person amounts taken directly from split_details); flagged for manual reconciliation.",
        });
      }

      const splits = normalizedDetails.map((d) => ({
        personName: d.canonical,
        shareValue: d.value,
        amountOwedInInr: roundCurrency(d.value),
      }));

      checkForMissingOrExtraNames(splitWith, splits, anomalies);
      return { splits, anomalies };
    }

    default: {
      anomalies.push({
        type: "UNKNOWN_SPLIT_TYPE",
        description: `Unrecognised split_type "${splitType}".`,
        action: "Fell back to an equal split across split_with; flagged for manual review.",
      });
      const each = roundCurrency(amountInInr / splitWith.length);
      return {
        splits: splitWith.map((personName) => ({
          personName,
          shareValue: null,
          amountOwedInInr: each,
        })),
        anomalies,
      };
    }
  }
}

// Small helper - normalize a single name the same way parseSplitWith does,
// without needing a ";"-joined string.
function parseSplitWithSingle(name) {
  const { names } = parseSplitWith(name);
  return { canonical: names[0] || name };
}

/**
 * Flags cases where split_with and split_details disagree on who's involved.
 */
function checkForMissingOrExtraNames(splitWith, splits, anomalies) {
  const detailNames = new Set(splits.map((s) => s.personName));
  const splitWithSet = new Set(splitWith);

  for (const name of splitWith) {
    if (!detailNames.has(name)) {
      anomalies.push({
        type: "MISSING_SPLIT_DETAIL_FOR_PERSON",
        description: `"${name}" is listed in split_with but has no entry in split_details.`,
        action: `"${name}" was given a 0 share for this expense; flagged for manual review.`,
      });
      splits.push({ personName: name, shareValue: 0, amountOwedInInr: 0 });
    }
  }

  for (const name of detailNames) {
    if (!splitWithSet.has(name)) {
      anomalies.push({
        type: "EXTRA_SPLIT_DETAIL_NAME",
        description: `"${name}" appears in split_details but not in split_with.`,
        action: `"${name}"'s share was still applied; flagged for manual review of split_with for this row.`,
      });
    }
  }
}

module.exports = { calculateSplits, parseSplitDetails };
