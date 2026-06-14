const express = require("express");
const prisma = require("../lib/prisma");
const { getBalances, suggestSettlements } = require("../services/balances");

const router = express.Router();

/**
 * GET /api/people
 */
router.get("/people", async (req, res) => {
  const people = await prisma.person.findMany({ orderBy: { name: "asc" } });
  res.json(people);
});

/**
 * POST /api/people
 * Body: { name, isActive? }
 */
router.post("/people", async (req, res) => {
  const { name, isActive } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required." });

  try {
    const person = await prisma.person.create({
      data: { name: name.trim(), isActive: isActive ?? true },
    });
    res.status(201).json(person);
  } catch (err) {
    res.status(409).json({ error: `A person named "${name}" already exists.` });
  }
});

/**
 * PATCH /api/people/:id
 * Body: { isActive?, leftAt? } - e.g. mark someone as moved out.
 */
router.patch("/people/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { isActive, leftAt, notes } = req.body;

  const data = {};
  if (isActive !== undefined) data.isActive = isActive;
  if (leftAt !== undefined) data.leftAt = leftAt ? new Date(leftAt) : null;
  if (notes !== undefined) data.notes = notes;

  try {
    const person = await prisma.person.update({ where: { id }, data });
    res.json(person);
  } catch (err) {
    res.status(404).json({ error: "Person not found." });
  }
});

/**
 * GET /api/balances
 * Returns each person's net balance (positive = owed money, negative =
 * owes money), plus a minimal suggested set of settle-up transactions.
 */
router.get("/balances", async (req, res) => {
  const balances = await getBalances(prisma);
  const suggestions = suggestSettlements(balances);
  res.json({ balances, suggestedSettlements: suggestions });
});

module.exports = router;
