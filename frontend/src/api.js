const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Imports
  uploadCsv: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/imports", { method: "POST", body: form });
  },
  listImports: () => request("/imports"),
  getImport: (id) => request(`/imports/${id}`),

  // Expenses
  listExpenses: () => request("/expenses"),
  getExpense: (id) => request(`/expenses/${id}`),
  createExpense: (data) => request("/expenses", { method: "POST", body: JSON.stringify(data) }),
  updateExpense: (id, data) => request(`/expenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: "DELETE" }),

  // Settlements
  listSettlements: () => request("/settlements"),
  createSettlement: (data) => request("/settlements", { method: "POST", body: JSON.stringify(data) }),

  // People
  listPeople: () => request("/people"),
  createPerson: (data) => request("/people", { method: "POST", body: JSON.stringify(data) }),
  updatePerson: (id, data) => request(`/people/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Balances
  getBalances: () => request("/balances"),
};
