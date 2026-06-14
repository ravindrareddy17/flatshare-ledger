import { useEffect, useState } from "react";
import { api } from "../api";
import { formatInr, formatDate } from "../format";

export default function Settlements() {
  const [settlements, setSettlements] = useState([]);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ date: "", fromPersonId: "", toPersonId: "", amountInInr: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    Promise.all([api.listSettlements(), api.listPeople()])
      .then(([s, p]) => {
        setSettlements(s);
        setPeople(p);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    if (!form.date || !form.fromPersonId || !form.toPersonId || !form.amountInInr) {
      setFormError("All fields except notes are required.");
      return;
    }
    if (form.fromPersonId === form.toPersonId) {
      setFormError("Payer and recipient must be different people.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.createSettlement({
        date: form.date,
        fromPersonId: Number(form.fromPersonId),
        toPersonId: Number(form.toPersonId),
        amountInInr: Number(form.amountInInr),
        notes: form.notes || undefined,
      });
      setSettlements((prev) => [...prev, created]);
      setForm({ date: "", fromPersonId: "", toPersonId: "", amountInInr: "", notes: "" });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-gray-500">Loading settlements…</p>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Record a settlement</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </Field>
          <Field label="Amount (INR)">
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.amountInInr}
              onChange={(e) => setForm((f) => ({ ...f, amountInInr: e.target.value }))}
            />
          </Field>
          <Field label="From (payer)">
            <select className="input" value={form.fromPersonId} onChange={(e) => setForm((f) => ({ ...f, fromPersonId: e.target.value }))}>
              <option value="">Select person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="To (recipient)">
            <select className="input" value={form.toPersonId} onChange={(e) => setForm((f) => ({ ...f, toPersonId: e.target.value }))}>
              <option value="">Select person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes (optional)" full>
            <input
              type="text"
              className="input"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>

          {formError && <p className="sm:col-span-2 text-sm text-red-600">{formError}</p>}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Record settlement"}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Settlement history ({settlements.length})</h2>
        {settlements.length === 0 ? (
          <p className="text-sm text-gray-500">No settlements recorded yet.</p>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border divide-y">
            {settlements.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{s.fromPerson.name}</span> paid{" "}
                  <span className="font-medium">{s.toPerson.name}</span>
                  {s.notes && <span className="text-gray-400"> — {s.notes}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-gray-400">{formatDate(s.date)}</span>
                  <span className="font-semibold">{formatInr(s.amountInInr)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <style>{`.input { border: 1px solid #d1d5db; border-radius: 0.375rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; width: 100%; }`}</style>
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`text-sm text-gray-600 ${full ? "sm:col-span-2" : ""}`}>
      <span className="block mb-1">{label}</span>
      {children}
    </label>
  );
}
