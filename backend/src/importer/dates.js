/**
 * Date normalisation.
 *
 * The CSV is overwhelmingly DD-MM-YYYY (e.g. "01-02-2026"). Two rows break
 * that pattern:
 *   - "Mar-14"        -> month-abbreviation + day, no year
 *   - "04-05-2026"    -> explicitly flagged by the user as ambiguous
 *                        (April 5 vs May 4)
 *
 * See DECISIONS.md - "Date parsing strategy" for the reasoning behind the
 * choices made below. Every non-standard date produces an anomaly record
 * regardless of how it was resolved, so a human can double check.
 */

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DEFAULT_YEAR = 2026; // all dates in this dataset fall in 2026

/**
 * @param {string} raw
 * @returns {{ date: Date, anomaly: null | { type: string, description: string, action: string } }}
 */
function parseDate(raw) {
  const value = String(raw).trim();

  // Standard DD-MM-YYYY
  const standard = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(value);
  if (standard) {
    const [, dd, mm, yyyy] = standard;
    const day = parseInt(dd, 10);
    const month = parseInt(mm, 10);
    const year = parseInt(yyyy, 10);

    // The one row explicitly flagged by the user as ambiguous
    // (04-05-2026 -> "is this April 5 or May 4?")
    if (raw.trim() === "04-05-2026") {
      return {
        date: new Date(Date.UTC(year, month - 1, day)),
        anomaly: {
          type: "AMBIGUOUS_DATE",
          description:
            'Date "04-05-2026" is ambiguous (DD-MM vs MM-DD) - could mean 4 May 2026 or 5 Apr 2026.',
          action:
            "Interpreted as DD-MM-YYYY (4 May 2026) for consistency with every other date in the file. Flagged for manual confirmation.",
        },
      };
    }

    return { date: new Date(Date.UTC(year, month - 1, day)), anomaly: null };
  }

  // "Mar-14" style (month abbreviation - day, no year)
  const monthAbbrev = /^([A-Za-z]{3})-(\d{1,2})$/.exec(value);
  if (monthAbbrev) {
    const [, monAbbrev, dd] = monthAbbrev;
    const month = MONTHS[monAbbrev.toLowerCase()];
    const day = parseInt(dd, 10);

    if (month) {
      return {
        date: new Date(Date.UTC(DEFAULT_YEAR, month - 1, day)),
        anomaly: {
          type: "DATE_FORMAT_NORMALIZED",
          description: `Date "${value}" uses a different format (Mon-DD, no year) from the rest of the file (DD-MM-YYYY).`,
          action: `Parsed as ${String(day).padStart(2, "0")}-${String(
            month
          ).padStart(2, "0")}-${DEFAULT_YEAR} (year inferred from surrounding rows, all of which are ${DEFAULT_YEAR}).`,
        },
      };
    }
  }

  // Unparseable - return an invalid date so the importer can flag it hard
  return {
    date: new Date(NaN),
    anomaly: {
      type: "UNPARSEABLE_DATE",
      description: `Date value "${value}" could not be parsed in any known format.`,
      action: "Row imported with a null date and excluded from balances; flagged for manual fix.",
    },
  };
}

module.exports = { parseDate, DEFAULT_YEAR };
