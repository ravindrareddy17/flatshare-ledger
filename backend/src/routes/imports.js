const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");

const prisma = require("../lib/prisma");
const { runImport } = require("../importer/engine");
const { persistImport } = require("../importer/importService");
const { summarizeAnomalies } = require("../services/aiSummary");

const router = express.Router();
const upload = multer({ dest: os.tmpdir() });

/**
 * POST /api/imports
 * Accepts a CSV file upload (field name "file"), runs the import pipeline,
 * persists results, and returns the Import Report (including an AI
 * summary, if available).
 */
router.post("/imports", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded (expected field 'file')." });
  }

  try {
    const result = runImport(req.file.path);
    const { importId } = await persistImport(prisma, req.file.originalname, result);

    const aiSummary = await summarizeAnomalies(result.anomalies);

    const importRecord = await prisma.import.findUnique({
      where: { id: importId },
      include: { anomalies: true },
    });

    res.json({
      importId,
      filename: importRecord.filename,
      importedAt: importRecord.importedAt,
      summary: {
        totalRows: importRecord.totalRows,
        expenseCount: importRecord.expenseCount,
        settlementCount: importRecord.settlementCount,
        skippedCount: importRecord.skippedCount,
        anomalyCount: importRecord.anomalyCount,
      },
      aiSummary,
      anomalies: importRecord.anomalies,
    });
  } catch (err) {
    console.error("Import failed:", err);
    res.status(500).json({ error: "Import failed.", details: String(err.message || err) });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

/**
 * GET /api/imports/:id
 * Returns a previously-run import report (without re-running the AI
 * summary, to avoid repeated API calls).
 */
router.get("/imports/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const importRecord = await prisma.import.findUnique({
    where: { id },
    include: { anomalies: true },
  });

  if (!importRecord) return res.status(404).json({ error: "Import not found." });

  res.json({
    importId: importRecord.id,
    filename: importRecord.filename,
    importedAt: importRecord.importedAt,
    summary: {
      totalRows: importRecord.totalRows,
      expenseCount: importRecord.expenseCount,
      settlementCount: importRecord.settlementCount,
      skippedCount: importRecord.skippedCount,
      anomalyCount: importRecord.anomalyCount,
    },
    anomalies: importRecord.anomalies,
  });
});

/**
 * GET /api/imports
 * Lists all imports (most recent first).
 */
router.get("/imports", async (req, res) => {
  const imports = await prisma.import.findMany({ orderBy: { importedAt: "desc" } });
  res.json(imports);
});

module.exports = router;
