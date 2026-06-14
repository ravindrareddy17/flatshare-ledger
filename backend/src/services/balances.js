/**
 * Computes each person's net balance from the database.
 *
 * Convention: a positive balance means the group owes that person money
 * (they've paid more than their share); a negative balance means that
 * person owes the group money.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @returns {Promise<Array<{ personId: number, name: string, isActive: boolean, balance: number }>>}
 */
async function getBalances(prisma) {
  const people = await prisma.person.findMany();
  const balances = {};
  for (const p of people) balances[p.id] = 0;

  const expenses = await prisma.expense.findMany({
    where: { excludeFromBalances: false },
    include: { splits: true },
  });

  for (const e of expenses) {
    if (e.paidById) {
      balances[e.paidById] = (balances[e.paidById] || 0) + Number(e.amountInInr);
    }
    for (const split of e.splits) {
      balances[split.personId] = (balances[split.personId] || 0) - Number(split.amountOwedInInr);
    }
  }

  const settlements = await prisma.settlement.findMany();
  for (const s of settlements) {
    // fromPerson paid toPerson directly -> fromPerson's "amount owed" goes
    // down (balance up), toPerson's balance goes down by the same amount.
    balances[s.fromPersonId] = (balances[s.fromPersonId] || 0) + Number(s.amountInInr);
    balances[s.toPersonId] = (balances[s.toPersonId] || 0) - Number(s.amountInInr);
  }

  return people.map((p) => ({
    personId: p.id,
    name: p.name,
    isActive: p.isActive,
    balance: round2(balances[p.id] || 0),
  }));
}

/**
 * Greedily matches debtors with creditors to produce a minimal list of
 * suggested "who pays whom" transactions to zero out all balances.
 *
 * @param {Array<{ personId: number, name: string, balance: number }>} balances
 * @returns {Array<{ from: string, to: string, amount: number }>}
 */
function suggestSettlements(balances) {
  const creditors = balances
    .filter((b) => b.balance > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balance - a.balance);

  const debtors = balances
    .filter((b) => b.balance < -0.01)
    .map((b) => ({ ...b, balance: -b.balance })) // work with positive "owes" amounts
    .sort((a, b) => b.balance - a.balance);

  const transactions = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round2(Math.min(debtor.balance, creditor.balance));

    if (amount > 0.01) {
      transactions.push({ from: debtor.name, to: creditor.name, amount });
    }

    debtor.balance = round2(debtor.balance - amount);
    creditor.balance = round2(creditor.balance - amount);

    if (debtor.balance <= 0.01) i++;
    if (creditor.balance <= 0.01) j++;
  }

  return transactions;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

module.exports = { getBalances, suggestSettlements };
