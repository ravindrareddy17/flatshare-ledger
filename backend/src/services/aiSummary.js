/**
 * AI-powered plain-English summary of an import's anomalies.
 *
 * See DECISIONS.md #9 and AI_USAGE.md for why this feature exists and how
 * it was developed/debugged.
 *
 * Design goal: this call is NOT on the critical path. If ANTHROPIC_API_KEY
 * is missing or the API call fails for any reason, the import still
 * succeeds and the Import Report still renders fully (just without the
 * natural-language summary at the top).
 */

const MODEL = "claude-sonnet-4-6";

/**
 * @param {Array<{sourceRow:number, field:string|null, anomalyType:string, severity:string, description:string, actionTaken:string}>} anomalies
 * @returns {Promise<string|null>} plain-English summary, or null if unavailable
 */
async function summarizeAnomalies(anomalies) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anomalies || anomalies.length === 0) {
    return "No data-quality issues were found in this import.";
  }

  const lines = anomalies
    .map(
      (a) =>
        `- Row ${a.sourceRow} [${a.severity}] ${a.anomalyType}${a.field ? ` (${a.field})` : ""}: ${a.description} -> ${a.actionTaken}`
    )
    .join("\n");

  const prompt = `You are summarising the results of an automated CSV import for a household shared-expense app, for a non-technical reader (a flatmate, not a developer).

Here is the full list of data-quality issues the importer found and how it handled each one:

${lines}

Write a short summary (4-8 sentences, plain English, no markdown headers, no bullet points) that:
- groups related issues together rather than listing all ${anomalies.length} one by one
- calls out anything that needs a human decision (anything the importer was unsure about), by row number
- reassures the reader about issues that were fixed automatically and need no action
- has a friendly, neutral tone - this is informational, not alarming

Respond with ONLY the summary text, nothing else.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("Claude API error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return text || null;
  } catch (err) {
    console.error("Claude API call failed:", err);
    return null;
  }
}

module.exports = { summarizeAnomalies };
