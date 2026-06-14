import { useEffect, useState } from "react";
import { api } from "../api";
import { formatInr, formatDate } from "../format";

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showExcluded, setShowExcluded] = useState(true);

  useEffect(() => {
    api
      .listExpenses()
      .then(setExpenses)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggleExclude(exp) {
    try {
      const updated = await api.updateExpense(exp.id, { excludeFromBalances: !exp.excludeFromBalances });
      setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (e) {
      alert(e.message);
    }
  }

  if (loading) return <p className="text-gray-500">Loading expenses…</p>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error}</div>;

  const visible = showExcluded ? expenses : expenses.filter((e) => !e.excludeFromBalances);

  if (expenses.length === 0) {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-8 text-center text-gray-500">
        No expenses yet. Import a CSV to get started.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Expenses ({visible.length})</h2>
        <label className="text-sm flex items-center gap-2 text-gray-600">
          <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} />
          Show excluded/flagged rows
        </label>
      </div>

      <div className="bg-white rounded-lg shadow-sm border divide-y">
        {visible.map((exp) => (
          <div key={exp.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{exp.description}</span>
                  {exp.flagged && (
                    <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
                      flagged
                    </span>
                  )}
                  {exp.excludeFromBalances && (
                    <span className="text-xs bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 rounded-full">
                      excluded from balances
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {formatDate(exp.date)} · paid by {exp.paidBy ? exp.paidBy.name : <em className="text-red-600">unassigned</em>} ·{" "}
                  {exp.splitType.toLowerCase()} split
                </p>
                {exp.currencyOriginal !== "INR" && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Original: {exp.amountOriginal} {exp.currencyOriginal} (rate {exp.exchangeRateUsed})
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold">{formatInr(exp.amountInInr)}</p>
                <button
                  onClick={() => toggleExclude(exp)}
                  className="text-xs text-brand hover:underline mt-1"
                >
                  {exp.excludeFromBalances ? "Include" : "Exclude"}
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              {exp.splits.map((s) => (
                <span key={s.id}>
                  {s.person.name}: {formatInr(s.amountOwedInInr)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
