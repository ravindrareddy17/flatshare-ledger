import { useState, useRef } from "react";
import { api } from "../api";
import { formatDate, SEVERITY_STYLES } from "../format";

export default function ImportCsv() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const fileInputRef = useRef(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setReport(null);

    try {
      const result = await api.uploadCsv(file);
      setReport(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const filteredAnomalies =
    report?.anomalies.filter((a) => severityFilter === "ALL" || a.severity === severityFilter) || [];

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-2">Import expenses CSV</h2>
        <p className="text-sm text-gray-500 mb-4">
          Upload an expenses export. The importer will normalise names/dates/amounts, detect
          duplicates and other data issues, and produce an Import Report below. Existing data is
          not removed — each import adds to the ledger.
        </p>

        <label className="inline-flex items-center gap-3 cursor-pointer bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
          {uploading ? "Importing…" : "Choose CSV file"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            Import failed: {error}
          </div>
        )}
      </section>

      {report && (
        <section className="space-y-4">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold mb-1">Import Report</h3>
            <p className="text-xs text-gray-400 mb-4">
              {report.filename} — imported {formatDate(report.importedAt)}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Stat label="Rows read" value={report.summary.totalRows} />
              <Stat label="Expenses" value={report.summary.expenseCount} />
              <Stat label="Settlements" value={report.summary.settlementCount} />
              <Stat label="Anomalies" value={report.summary.anomalyCount} />
            </div>

            {report.aiSummary && (
              <div className="bg-blue-50 border border-blue-100 rounded-md p-4 text-sm text-blue-900 mb-2">
                <p className="font-medium mb-1">✨ AI summary</p>
                <p className="whitespace-pre-line leading-relaxed">{report.aiSummary}</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Anomalies ({filteredAnomalies.length})</h3>
              <div className="flex gap-1">
                {["ALL", "ERROR", "WARNING", "INFO"].map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(sev)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      severityFilter === sev
                        ? "bg-brand text-white border-brand"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {filteredAnomalies.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No anomalies match this filter.</p>
            ) : (
              <div className="divide-y">
                {filteredAnomalies.map((a) => (
                  <div key={a.id} className="p-4 text-sm">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SEVERITY_STYLES[a.severity]}`}>
                        {a.severity}
                      </span>
                      <span className="text-gray-400">Row {a.sourceRow}</span>
                      {a.field && <span className="text-gray-400">· {a.field}</span>}
                      <span className="text-gray-400">· {a.anomalyType}</span>
                    </div>
                    <p className="text-gray-700">{a.description}</p>
                    <p className="text-gray-500 mt-0.5">
                      <span className="font-medium">Action: </span>
                      {a.actionTaken}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-md p-3 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
