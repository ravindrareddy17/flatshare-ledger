import { useEffect, useState } from "react";
import { api } from "../api";

export default function People() {
  const [people, setPeople] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .listPeople()
      .then(setPeople)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      const created = await api.createPerson({ name: newName.trim() });
      setPeople((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(person) {
    try {
      const updated = await api.updatePerson(person.id, {
        isActive: !person.isActive,
        leftAt: person.isActive ? new Date().toISOString() : null,
      });
      setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <p className="text-gray-500">Loading people…</p>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-3">Add a person</h2>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            className="border border-gray-300 rounded-md px-3 py-2 text-sm flex-1"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Household members ({people.length})</h2>
        <div className="bg-white rounded-lg shadow-sm border divide-y">
          {people.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="flex items-center gap-2">
                {p.name}
                {!p.isActive && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">moved out</span>
                )}
                {p.notes && <span className="text-xs text-gray-400">— {p.notes}</span>}
              </span>
              <button onClick={() => toggleActive(p)} className="text-xs text-brand hover:underline">
                Mark as {p.isActive ? "moved out" : "active"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
