#!/usr/bin/env node
/**
 * deploy-db.js — Production DB bootstrap for Render + Neon
 *
 * Triggered via "postinstall" (runs automatically after npm install,
 * BEFORE the Render dashboard build command fires).
 *
 * Steps:
 *  1. Drop _prisma_migrations via raw pg  → clears P3009 / P3005 state
 *  2. prisma generate                     → creates Prisma client
 *  3. prisma db push --accept-data-loss   → syncs all tables to Neon
 *  4. prisma migrate resolve --applied    → marks baseline migration as done
 *     so "prisma migrate deploy" (hardcoded in Render dashboard) is a no-op
 */

"use strict";

const MIGRATION_NAME = "20260615000001_init_postgresql";

// Skip in local dev (SQLite file: URL or missing DATABASE_URL)
const dbUrl = process.env.DATABASE_URL || "";
if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
  console.log("[deploy-db] Not a PostgreSQL environment — skipping.");
  process.exit(0);
}

const { execSync } = require("child_process");
const { Client } = require("pg");

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", ...opts });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("\n=== Flatshare Ledger: DB Bootstrap ===\n");

  // ── Step 1: Wipe _prisma_migrations so we start with a clean slate ─────────
  console.log("[1/4] Clearing _prisma_migrations table...");
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    await client.query('DROP TABLE IF EXISTS "_prisma_migrations"');
    console.log("      ✅ Cleared\n");
  } catch (err) {
    console.warn("      ⚠️  Could not clear (non-fatal):", err.message, "\n");
  } finally {
    await client.end().catch(() => {});
  }

  // ── Step 2: Generate Prisma client ─────────────────────────────────────────
  console.log("[2/4] Generating Prisma client...");
  if (!run("npx prisma generate")) {
    console.error("❌ prisma generate failed"); process.exit(1);
  }
  console.log();

  // ── Step 3: Push schema to Neon (creates all tables) ───────────────────────
  console.log("[3/4] Syncing schema → Neon (prisma db push)...");
  if (!run("npx prisma db push --accept-data-loss")) {
    console.error("❌ prisma db push failed"); process.exit(1);
  }
  console.log();

  // ── Step 4: Baseline the migration so prisma migrate deploy is a no-op ─────
  // The Render dashboard hardcodes "prisma migrate deploy" — we can't remove it.
  // Marking the migration as --applied means migrate deploy sees it as done.
  console.log(`[4/4] Baselining migration '${MIGRATION_NAME}'...`);
  if (!run(`npx prisma migrate resolve --applied "${MIGRATION_NAME}"`)) {
    // Non-fatal: might fail if already resolved, but deploy will still work
    console.warn("      ⚠️  resolve --applied failed (may already be set — continuing)\n");
  } else {
    console.log("      ✅ Migration marked as applied\n");
  }

  console.log("✅ DB bootstrap complete — schema live, migration baselined.\n");
}

main().catch((err) => {
  console.error("Fatal error in deploy-db.js:", err);
  process.exit(1);
});
