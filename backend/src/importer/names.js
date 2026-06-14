/**
 * Normalises raw "paid_by" / "split_with" name strings to a canonical
 * person name.
 *
 * Why a static alias table instead of pure fuzzy matching?
 * See DECISIONS.md - "Name normalisation strategy". Short version: fuzzy
 * matching on a 4-6 person household is overkill and risks merging two
 * different people; an explicit alias table is auditable and easy to extend.
 */

// Known aliases -> canonical name. Keys are lowercase + trimmed.
const ALIASES = {
  priya: "Priya",
  "priya s": "Priya",
  rohan: "Rohan",
  aisha: "Aisha",
  meera: "Meera",
  dev: "Dev",
  sam: "Sam",
};

/**
 * @param {string} raw
 * @returns {{ canonical: string, wasNormalized: boolean, originalTrimmed: string }}
 */
function normalizePersonName(raw) {
  if (raw === null || raw === undefined) {
    return { canonical: "", wasNormalized: false, originalTrimmed: "" };
  }

  const trimmed = String(raw).trim();
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");

  if (ALIASES[key]) {
    const canonical = ALIASES[key];
    const wasNormalized = canonical !== trimmed;
    return { canonical, wasNormalized, originalTrimmed: trimmed };
  }

  // Unknown name (e.g. "Dev's friend Kabir") - keep as-is after trimming
  // whitespace, but collapse internal whitespace runs.
  const canonical = trimmed.replace(/\s+/g, " ");
  return {
    canonical,
    wasNormalized: canonical !== trimmed,
    originalTrimmed: trimmed,
  };
}

/**
 * Splits a "split_with" cell (";"-delimited list of names) into an array of
 * normalized canonical names, alongside any normalization anomalies.
 *
 * @param {string} raw
 * @returns {{ names: string[], anomalies: Array<{rawValue: string, canonical: string}> }}
 */
function parseSplitWith(raw) {
  if (!raw) return { names: [], anomalies: [] };

  const parts = String(raw)
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const names = [];
  const anomalies = [];

  for (const part of parts) {
    const { canonical, wasNormalized, originalTrimmed } =
      normalizePersonName(part);
    names.push(canonical);
    if (wasNormalized) {
      anomalies.push({ rawValue: originalTrimmed, canonical });
    }
  }

  return { names, anomalies };
}

module.exports = { normalizePersonName, parseSplitWith, ALIASES };
