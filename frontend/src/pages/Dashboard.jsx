import { useEffect, useState } from "react";
import { api } from "../api";
import { formatInr } from "../format";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getBalances()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Loading balances…</p>;
  if (error)
    return (
      <ErrorBanner message={error} />
    );

  const { balances, suggestedSettlements } = data;

  if (balances.length === 0) {
    return (
      <EmptyState />
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-3">Balances</h2>
        <p className="text-sm text-gray-500 mb-4">
          Positive = the household owes this person money. Negative = this person owes the household.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {balances.map((b) => (
            <div key={b.personId} className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{b.name}</span>
                {!b.isActive && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">moved out</span>
                )}
              </div>
              <p
                className={`text-2xl font-semibold mt-1 ${
                  b.balance > 0.01 ? "text-positive" : b.balance < -0.01 ? "text-negative" : "text-gray-400"
                }`}
              >
                {formatInr(b.balance)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {b.balance > 0.01
                  ? "is owed money"
                  : b.balance < -0.01
                  ? "owes money"
                  : "all settled up"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Suggested settle-ups</h2>
        {suggestedSettlements.length === 0 ? (
          <p className="text-sm text-gray-500">Everyone is settled up — nothing to pay! 🎉</p>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border divide-y">
            {suggestedSettlements.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{s.from}</span> pays{" "}
                  <span className="font-medium">{s.to}</span>
                </span>
                <span className="font-semibold">{formatInr(s.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
      Couldn't load balances: {message}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-lg border shadow-sm p-8 text-center">
      <p className="text-gray-500 mb-2">No data yet.</p>
      <p className="text-sm text-gray-400">
        Head to <span className="font-medium">Import CSV</span> to upload an expenses file and get started.
      </p>
    </div>
  );
}
