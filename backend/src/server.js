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

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

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
