#!/usr/bin/env node
/**
 * deploy-db.js — Render production DB setup script
 *
 * Runs before the server starts. Handles two situations:
 *   1. Fresh Neon DB (no tables yet)          → creates all tables
 *   2. Neon DB with a stuck FAILED migration   → clears it, then creates tables
 *
 * Uses `prisma db push` which syncs schema.prisma directly to the database
 * without touching the _prisma_migrations table — immune to P3009.
 *
 * Falls back to raw SQL to drop the _prisma_migrations table if prisma db push
 * itself somehow complains about migration state.
 */

const { execSync } = require("child_process");

function run(cmd, label) {
  console.log(`\n▶  ${label}`);
  console.log(`   $ ${cmd}`);
  try {
    const out = execSync(cmd, { stdio: "pipe", encoding: "utf8" });
    if (out.trim()) console.log(out.trim());
    console.log(`✅ ${label} — done`);
    return true;
  } catch (err) {
    const msg = (err.stdout || "") + (err.stderr || "");
    console.error(`❌ ${label} failed:\n${msg}`);
    return false;
  }
}

async function main() {
  console.log("=== Flatshare Ledger — DB Deploy Script ===");
  console.log(`DATABASE_URL prefix: ${(process.env.DATABASE_URL || "").slice(0, 30)}...`);

  // Step 1: Generate Prisma client (always needed)
  if (!run("npx prisma generate", "Generate Prisma client")) {
    process.exit(1);
  }

  // Step 2: Try prisma db push (bypasses _prisma_migrations entirely)
  // --accept-data-loss: allow column drops on a fresh DB without interactive prompt
  if (run("npx prisma db push --accept-data-loss", "Sync schema → Neon (db push)")) {
    console.log("\n✅ DB deploy complete — schema is live on Neon.\n");
    process.exit(0);
  }

  // Step 3: db push failed — nuclear option: clear the _prisma_migrations table
  // and retry. This only happens if Neon has corrupt migration state.
  console.log("\n⚠️  db push failed. Attempting to clear stuck migration state...");

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    // Drop the whole migrations tracking table so we start clean
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "_prisma_migrations"`);
    console.log("✅ Cleared _prisma_migrations table");
    await prisma.$disconnect();
  } catch (e) {
    console.error("Could not clear _prisma_migrations:", e.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Retry db push with a clean slate
  if (run("npx prisma db push --accept-data-loss", "Sync schema → Neon (retry after clear)")) {
    console.log("\n✅ DB deploy complete (after migration state clear).\n");
    process.exit(0);
  }

  console.error("\n❌ DB deploy failed after all recovery attempts.");
  process.exit(1);
}

main();
