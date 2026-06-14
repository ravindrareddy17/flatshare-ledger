const path = require("path");
const { runImport } = require("./engine");

const csvPath = process.argv[2] || path.join(__dirname, "../../../Expenses_Export.csv");

const result = runImport(csvPath);

console.log("=== SUMMARY ===");
console.log(result.summary);

console.log("\n=== PEOPLE ===");
console.log(result.people);

console.log("\n=== ANOMALIES ===");
for (const a of result.anomalies) {
  console.log(`Row ${a.sourceRow} [${a.severity}] ${a.type} (${a.field})`);
  console.log(`  ${a.description}`);
  console.log(`  -> ${a.action}`);
}

console.log(`\nTotal anomalies: ${result.anomalies.length}`);
console.log(`  ERROR:   ${result.anomalies.filter((a) => a.severity === "ERROR").length}`);
console.log(`  WARNING: ${result.anomalies.filter((a) => a.severity === "WARNING").length}`);
console.log(`  INFO:    ${result.anomalies.filter((a) => a.severity === "INFO").length}`);

console.log("\n=== EXPENSES (excluding excludeFromBalances) ===");
for (const e of result.expenses) {
  const flag = e.excludeFromBalances ? " [EXCLUDED]" : e.flagged ? " [FLAGGED]" : "";
  console.log(
    `Row ${e.sourceRow}: ${e.date.toISOString().slice(0, 10)} | ${e.description} | paidBy=${e.paidBy} | ${e.amountOriginal} ${e.currencyOriginal} -> ${e.amountInInr} INR | ${e.splitType}${flag}`
  );
  for (const s of e.splits) {
    console.log(`    ${s.personName}: owes ${s.amountOwedInInr} INR`);
  }
}

console.log("\n=== SETTLEMENTS ===");
for (const s of result.settlements) {
  console.log(
    `Row ${s.sourceRow}: ${s.date.toISOString().slice(0, 10)} | ${s.fromPerson} -> ${s.toPerson} | ${s.amountOriginal} ${s.currencyOriginal} -> ${s.amountInInr} INR`
  );
}

// ---- Balance calculation sanity check --------------------------------------
console.log("\n=== NET BALANCES (positive = owed money by the group, negative = owes the group) ===");
const balances = {};
for (const name of result.people) balances[name] = 0;

for (const e of result.expenses) {
  if (e.excludeFromBalances) continue;
  if (e.paidBy) balances[e.paidBy] += e.amountInInr;
  for (const s of e.splits) {
    balances[s.personName] -= s.amountOwedInInr;
  }
}
for (const s of result.settlements) {
  balances[s.fromPerson] += s.amountInInr; // paid money to toPerson, reduces what fromPerson owes (i.e. increases their balance)
  balances[s.toPerson] -= s.amountInInr;
}

for (const [name, bal] of Object.entries(balances)) {
  console.log(`  ${name}: ${roundCurrency(bal)} INR`);
}

function roundCurrency(v) {
  return Math.round(v * 100) / 100;
}
