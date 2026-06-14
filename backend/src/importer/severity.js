/**
 * Maps each anomaly "type" string to a severity level.
 *
 *   ERROR   - the importer could not confidently process the row; it is
 *             excluded from balance calculations until a human fixes it.
 *   WARNING - the importer made a judgement call; the row IS included in
 *             balances, but a human should double-check the call.
 *   INFO    - a cosmetic/normalisation fix with no effect on balances.
 */
const SEVERITY = {
  // Names
  NAME_NORMALIZED: "INFO",

  // Dates
  DATE_FORMAT_NORMALIZED: "WARNING",
  AMBIGUOUS_DATE: "WARNING",
  UNPARSEABLE_DATE: "ERROR",

  // Amounts / currency
  AMOUNT_THOUSANDS_SEPARATOR: "INFO",
  AMOUNT_PRECISION: "INFO",
  UNPARSEABLE_AMOUNT: "ERROR",
  MISSING_CURRENCY: "INFO",
  FX_CONVERSION: "INFO",
  UNKNOWN_CURRENCY: "ERROR",
  NEGATIVE_AMOUNT: "WARNING",
  ZERO_AMOUNT: "INFO",

  // Payer / participants
  MISSING_PAYER: "ERROR",
  EMPTY_SPLIT_WITH: "ERROR",
  INACTIVE_PERSON_IN_SPLIT: "WARNING",
  NEW_PERSON_AUTO_CREATED: "INFO",

  // Split logic
  SPLIT_DETAILS_IGNORED: "WARNING",
  PERCENTAGE_SUM_MISMATCH: "WARNING",
  UNEQUAL_SUM_MISMATCH: "WARNING",
  SHARE_TOTAL_ZERO: "ERROR",
  UNKNOWN_SPLIT_TYPE: "ERROR",
  MISSING_SPLIT_DETAIL_FOR_PERSON: "WARNING",
  EXTRA_SPLIT_DETAIL_NAME: "WARNING",

  // Row classification
  SETTLEMENT_DETECTED: "INFO",
  POSSIBLE_DUPLICATE: "WARNING",
  POSSIBLE_DUPLICATE_DIFFERENT_AMOUNTS: "WARNING",
};

function severityOf(type) {
  return SEVERITY[type] || "WARNING";
}

module.exports = { SEVERITY, severityOf };
