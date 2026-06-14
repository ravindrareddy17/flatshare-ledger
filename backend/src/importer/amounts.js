/**
 * Amount parsing, rounding, and currency conversion.
 *
 * See DECISIONS.md - "Currency handling" for why a fixed FX rate is used
 * instead of a live exchange-rate API.
 */

// Fixed conversion rate used for the Goa-trip USD entries.
// This is a documented assumption, not a live rate - see DECISIONS.md.
const USD_TO_INR_RATE = 83;

/**
 * Rounds a number to 2 decimal places, avoiding the classic
 * floating-point "899.995 -> 899.99" bug.
 * @param {number} value
 * @returns {number}
 */
function roundCurrency(value) {
  return Math.round((value + Number.EPSILON * value + 1e-9) * 100) / 100;
}

/**
 * Parses an "amount" cell, which may contain thousands separators (commas)
 * and/or more than 2 decimal places.
 *
 * @param {string} raw
 * @returns {{ value: number, anomaly: null | { type: string, description: string, action: string } }}
 */
function parseAmount(raw) {
  const original = String(raw).trim();
  const stripped = original.replace(/,/g, "");
  const value = Number(stripped);

  if (Number.isNaN(value)) {
    return {
      value: 0,
      anomaly: {
        type: "UNPARSEABLE_AMOUNT",
        description: `Amount value "${original}" could not be parsed as a number.`,
        action: "Row imported with amount=0 and excluded from balances; flagged for manual fix.",
      },
    };
  }

  const decimalPlaces = (stripped.split(".")[1] || "").length;
  const rounded = roundCurrency(value);

  let anomaly = null;

  if (original.includes(",")) {
    anomaly = {
      type: "AMOUNT_THOUSANDS_SEPARATOR",
      description: `Amount "${original}" contains a thousands-separator comma.`,
      action: `Parsed as ${rounded}.`,
    };
  } else if (decimalPlaces > 2) {
    anomaly = {
      type: "AMOUNT_PRECISION",
      description: `Amount "${original}" has ${decimalPlaces} decimal places (more precision than currency allows).`,
      action: `Rounded to 2 decimal places (${rounded}).`,
    };
  }

  return { value: rounded, anomaly };
}

/**
 * Converts an amount in a given currency to INR.
 *
 * @param {number} amount
 * @param {string} currency
 * @returns {{ amountInInr: number, exchangeRateUsed: number | null, anomaly: null | object }}
 */
function convertToInr(amount, currency) {
  const code = (currency || "").trim().toUpperCase();

  if (code === "" || code === "INR") {
    return { amountInInr: roundCurrency(amount), exchangeRateUsed: null, anomaly: null };
  }

  if (code === "USD") {
    const amountInInr = roundCurrency(amount * USD_TO_INR_RATE);
    return {
      amountInInr,
      exchangeRateUsed: USD_TO_INR_RATE,
      anomaly: {
        type: "FX_CONVERSION",
        description: `Amount of ${amount} USD converted to INR for balance calculations.`,
        action: `Converted at a fixed rate of 1 USD = ${USD_TO_INR_RATE} INR (documented assumption, not a live rate - see DECISIONS.md). Original amount and currency preserved on the record.`,
      },
    };
  }

  // Unknown currency code - treat the number as-is (1:1) but flag loudly.
  return {
    amountInInr: roundCurrency(amount),
    exchangeRateUsed: 1,
    anomaly: {
      type: "UNKNOWN_CURRENCY",
      description: `Currency code "${currency}" is not recognised (expected INR or USD).`,
      action: "Treated as INR 1:1 for balance calculations. Flagged for manual correction.",
    },
  };
}

/**
 * Handles a missing currency value.
 * @param {string} raw
 * @returns {{ currency: string, anomaly: null | object }}
 */
function resolveCurrency(raw) {
  const trimmed = (raw || "").trim();
  if (trimmed === "") {
    return {
      currency: "INR",
      anomaly: {
        type: "MISSING_CURRENCY",
        description: 'The "currency" field was empty.',
        action: "Defaulted to INR (consistent with every other row from the same time period).",
      },
    };
  }
  return { currency: trimmed.toUpperCase(), anomaly: null };
}

module.exports = { parseAmount, convertToInr, resolveCurrency, roundCurrency, USD_TO_INR_RATE };
