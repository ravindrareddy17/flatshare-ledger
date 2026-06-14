require("dotenv").config();
const express = require("express");
const cors = require("cors");

const importsRouter = require("./routes/imports");
const expensesRouter = require("./routes/expenses");
const peopleRouter = require("./routes/people");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.json({
  name: "Flatshare Ledger API",
  status: "running",
  version: "1.0.0",
  endpoints: {
    health:      "GET  /api/health",
    imports:     "GET  /api/imports",
    uploadCsv:   "POST /api/imports",
    expenses:    "GET  /api/expenses",
    settlements: "GET  /api/settlements",
    people:      "GET  /api/people",
    balances:    "GET  /api/balances",
  }
}));

app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api", importsRouter);
app.use("/api", expensesRouter);
app.use("/api", peopleRouter);

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`Flatshare Ledger API listening on port ${PORT}`);
});
