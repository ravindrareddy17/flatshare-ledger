#!/usr/bin/env node
/**
 * deploy-db.js — Production DB bootstrap for Render + Neon
 *
 * Triggered via: "postinstall" npm hook (runs automatically after npm install)
 * This means it runs BEFORE any build command the Render dashboard specifies.
 *
 * Steps:
 *  1. Drop the _prisma_migrations table from Neon (clears P3009 stuck state)
 *  2. Run `prisma generate` (creates the Prisma client)
 *  3. Run `prisma db push` (syncs schema.prisma → Neon, no migrations needed)
 *
 * Using raw `pg` for Step 1 so we don't need the Prisma client yet.
 */

"use strict";

// Skip entirely in local dev (DATABASE_URL will be a file: URL or missing)
const dbUrl = process.env.DATABASE_URL || "";
if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
  console.log("[deploy-db] Skipping — not a PostgreSQL environment.");
  process.exit(0);
}

const { execSync } = require("child_process");
const { Client } = require("pg");

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("\n=== Flatshare Ledger: DB Bootstrap ===");

  // ── Step 1: Clear stuck _prisma_migrations via raw pg ──────────────────────
  console.log("\n[1/3] Clearing _prisma_migrations (fixes P3009)...");
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    await client.query('DROP TABLE IF EXISTS "_prisma_migrations"');
    console.log("      ✅ _prisma_migrations cleared");
  } catch (err) {
    console.warn("      ⚠️  Could not clear _prisma_migrations:", err.message);
    // Non-fatal — continue anyway
  } finally {
    await client.end().catch(() => {});
  }

  // ── Step 2: Generate Prisma client ─────────────────────────────────────────
  console.log("\n[2/3] Generating Prisma client...");
  if (!run("npx prisma generate")) {
    console.error("❌ prisma generate failed");
    process.exit(1);
  }

  // ── Step 3: Push schema to Neon ────────────────────────────────────────────
  console.log("\n[3/3] Pushing schema to Neon (prisma db push)...");
  if (!run("npx prisma db push --accept-data-loss")) {
    console.error("❌ prisma db push failed");
    process.exit(1);
  }

  console.log("\n✅ DB bootstrap complete — Neon is in sync with schema.prisma\n");
}

main().catch((err) => {
  console.error("Fatal error in deploy-db.js:", err);
  process.exit(1);
});
