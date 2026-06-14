const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

/**
 * GET /api/expenses
 * Lists all expenses, including their splits and payer.
 * Query params: ?includeExcluded=true to include excludeFromBalances rows
 *               (default: included, but flagged in the response).
 */
router.get("/expenses", async (req, res) => {
  const expenses = await prisma.expense.findMany({
    orderBy: { date: "asc" },
    include: {
      paidBy: true,
      splits: { include: { person: true } },
    },
  });
  res.json(expenses);
});

/**
 * GET /api/expenses/:id
 */
router.get("/expenses/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: { paidBy: true, splits: { include: { person: true } } },
  });
  if (!expense) return res.status(404).json({ error: "Expense not found." });
  res.json(expense);
});

/**
 * POST /api/expenses
 * Manually create a new expense (for fixing flagged rows or adding new
 * ones outside of CSV import).
 *
 * Body: {
 *   date, description, notes?, paidById, amountInInr, currencyOriginal?,
 *   amountOriginal?, splitType, splits: [{ personId, amountOwedInInr, shareValue? }]
 * }
 */
router.post("/expenses", async (req, res) => {
  const {
    date,
    description,
    notes,
    paidById,
    amountOriginal,
    currencyOriginal,
    amountInInr,
    splitType,
    splits,
  } = req.body;

  if (!date || !description || !amountInInr || !splitType || !Array.isArray(splits)) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const splitSum = splits.reduce((sum, s) => sum + Number(s.amountOwedInInr), 0);
  if (Math.abs(splitSum - Number(amountInInr)) > 0.01) {
    return res.status(400).json({
      error: `Split amounts (${splitSum}) do not sum to the expense amount (${amountInInr}).`,
    });
  }

  const expense = await prisma.expense.create({
    data: {
      date: new Date(date),
      description,
      notes: notes || null,
      paidById: paidById || null,
      amountOriginal: amountOriginal ?? amountInInr,
      currencyOriginal: currencyOriginal || "INR",
      amountInInr,
      splitType,
      splits: {
        create: splits.map((s) => ({
          personId: s.personId,
          shareValue: s.shareValue ?? null,
          amountOwedInInr: s.amountOwedInInr,
        })),
      },
    },
    include: { paidBy: true, splits: { include: { person: true } } },
  });

  res.status(201).json(expense);
});

/**
 * PATCH /api/expenses/:id
 * Used to resolve flagged/excluded expenses (e.g. set paidById on a
 * MISSING_PAYER row, or toggle excludeFromBalances on a duplicate).
 */
router.patch("/expenses/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { paidById, excludeFromBalances, flagged, notes } = req.body;

  const data = {};
  if (paidById !== undefined) data.paidById = paidById;
  if (excludeFromBalances !== undefined) data.excludeFromBalances = excludeFromBalances;
  if (flagged !== undefined) data.flagged = flagged;
  if (notes !== undefined) data.notes = notes;

  try {
    const expense = await prisma.expense.update({
      where: { id },
      data,
      include: { paidBy: true, splits: { include: { person: true } } },
    });
    res.json(expense);
  } catch (err) {
    res.status(404).json({ error: "Expense not found." });
  }
});

/**
 * DELETE /api/expenses/:id
 */
router.delete("/expenses/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await prisma.expense.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: "Expense not found." });
  }
});

/**
 * GET /api/settlements
 */
router.get("/settlements", async (req, res) => {
  const settlements = await prisma.settlement.findMany({
    orderBy: { date: "asc" },
    include: { fromPerson: true, toPerson: true },
  });
  res.json(settlements);
});

/**
 * POST /api/settlements
 * Record a manual settlement (e.g. "Rohan paid Aisha ₹2000 to settle up").
 * Body: { date, fromPersonId, toPersonId, amountInInr, notes? }
 */
router.post("/settlements", async (req, res) => {
  const { date, fromPersonId, toPersonId, amountOriginal, currencyOriginal, amountInInr, notes } = req.body;

  if (!date || !fromPersonId || !toPersonId || !amountInInr) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  if (fromPersonId === toPersonId) {
    return res.status(400).json({ error: "fromPersonId and toPersonId must differ." });
  }

  const settlement = await prisma.settlement.create({
    data: {
      date: new Date(date),
      fromPersonId,
      toPersonId,
      amountOriginal: amountOriginal ?? amountInInr,
      currencyOriginal: currencyOriginal || "INR",
      amountInInr,
      notes: notes || null,
    },
    include: { fromPerson: true, toPerson: true },
  });

  res.status(201).json(settlement);
});

module.exports = router;
