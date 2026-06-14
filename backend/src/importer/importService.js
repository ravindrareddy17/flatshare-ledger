const { ROSTER_DEPARTURES, isOneOffGuest } = require("./engine");

/**
 * Persists the result of `runImport()` into the database.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} filename
 * @param {ReturnType<typeof import("./engine").runImport>} result
 * @returns {Promise<{ importId: number }>}
 */
async function persistImport(prisma, filename, result) {
  const imp = await prisma.import.create({
    data: {
      filename,
      totalRows: result.summary.totalRows,
      expenseCount: result.summary.expenseCount,
      settlementCount: result.summary.settlementCount,
      skippedCount: result.summary.skippedCount,
      anomalyCount: result.summary.anomalyCount,
    },
  });

  // ---- Upsert people ---------------------------------------------------
  const personIdByName = {};
  for (const name of result.people) {
    const departure = ROSTER_DEPARTURES.find((d) => d.person === name);
    const isActive = !departure && !isOneOffGuest(name);

    const person = await prisma.person.upsert({
      where: { name },
      update: {},
      create: {
        name,
        isActive,
        leftAt: departure ? departure.leftAfter : null,
        notes: isOneOffGuest(name) ? "Auto-created one-off guest during import." : null,
      },
    });
    personIdByName[name] = person.id;
  }

  // ---- Expenses + splits --------------------------------------------------
  for (const e of result.expenses) {
    const created = await prisma.expense.create({
      data: {
        importId: imp.id,
        sourceRow: e.sourceRow,
        date: e.date,
        description: e.description,
        notes: e.notes,
        paidById: e.paidBy ? personIdByName[e.paidBy] : null,
        amountOriginal: e.amountOriginal,
        currencyOriginal: e.currencyOriginal,
        amountInInr: e.amountInInr,
        exchangeRateUsed: e.exchangeRateUsed,
        splitType: e.splitType,
        flagged: e.flagged,
        excludeFromBalances: e.excludeFromBalances,
        // isDuplicateOf is resolved in a second pass below, since it
        // references another Expense's *database* id, not its source row.
      },
    });

    if (e.splits.length > 0) {
      await prisma.expenseSplit.createMany({
        data: e.splits.map((s) => ({
          expenseId: created.id,
          personId: personIdByName[s.personName],
          shareValue: s.shareValue,
          amountOwedInInr: s.amountOwedInInr,
        })),
      });
    }

    // Stash the DB id keyed by source row, for the duplicate-link pass.
    e._dbId = created.id;
  }

  // Second pass: resolve isDuplicateOf (source row -> db id)
  const dbIdBySourceRow = {};
  for (const e of result.expenses) dbIdBySourceRow[e.sourceRow] = e._dbId;

  for (const e of result.expenses) {
    if (e.isDuplicateOf) {
      await prisma.expense.update({
        where: { id: e._dbId },
        data: { isDuplicateOf: dbIdBySourceRow[e.isDuplicateOf] },
      });
    }
  }

  // ---- Settlements ----------------------------------------------------
  for (const s of result.settlements) {
    await prisma.settlement.create({
      data: {
        importId: imp.id,
        sourceRow: s.sourceRow,
        date: s.date,
        notes: s.notes,
        fromPersonId: personIdByName[s.fromPerson],
        toPersonId: personIdByName[s.toPerson],
        amountOriginal: s.amountOriginal,
        currencyOriginal: s.currencyOriginal,
        amountInInr: s.amountInInr,
        exchangeRateUsed: s.exchangeRateUsed,
      },
    });
  }

  // ---- Anomalies --------------------------------------------------------
  if (result.anomalies.length > 0) {
    await prisma.anomalyRecord.createMany({
      data: result.anomalies.map((a) => ({
        importId: imp.id,
        sourceRow: a.sourceRow,
        field: a.field,
        anomalyType: a.type,
        severity: a.severity,
        rawValue: a.rawValue !== null && a.rawValue !== undefined ? String(a.rawValue) : null,
        description: a.description,
        actionTaken: a.action,
      })),
    });
  }

  return { importId: imp.id };
}

module.exports = { persistImport };
