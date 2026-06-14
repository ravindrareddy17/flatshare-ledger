export function formatInr(value) {
  const num = Number(value);
  const sign = num < 0 ? "-" : "";
  return `${sign}₹${Math.abs(num).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Invalid date";
  return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
}

export const SEVERITY_STYLES = {
  ERROR: "bg-red-100 text-red-800 border-red-300",
  WARNING: "bg-amber-100 text-amber-800 border-amber-300",
  INFO: "bg-blue-100 text-blue-800 border-blue-300",
};
