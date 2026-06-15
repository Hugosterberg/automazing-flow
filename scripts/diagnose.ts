/**
 * Self-diagnostics CLI: prints a clear PASS/WARN/FAIL report of configuration
 * and database schema so problems that need fixing are obvious. Exits non-zero
 * when any blocking error is found (so it can gate CI / deploys).
 *
 * Run: npm run diagnose
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  buildConfigChecks,
  runDatabaseChecks,
  snapshotFromEnv,
  summarize,
  type CheckStatus,
  type DiagnosticCheck,
} from "../server/lib/diagnostics.ts";

// Load .env.local first (the project's local secrets), then .env as fallback —
// matching how the server resolves env so the report reflects reality.
for (const file of [".env.local", ".env"]) {
  const p = path.join(process.cwd(), file);
  if (fs.existsSync(p)) {
    let raw = fs.readFileSync(p, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    for (const [k, v] of Object.entries(dotenv.parse(raw))) {
      if (process.env[k] === undefined) process.env[k] = String(v);
    }
  }
}

const COLORS: Record<CheckStatus, string> = { ok: "\x1b[32m", warn: "\x1b[33m", error: "\x1b[31m" };
const MARK: Record<CheckStatus, string> = { ok: "PASS", warn: "WARN", error: "FAIL" };
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

function line(c: DiagnosticCheck) {
  const color = process.stdout.isTTY ? COLORS[c.status] : "";
  const reset = process.stdout.isTTY ? RESET : "";
  const dim = process.stdout.isTTY ? DIM : "";
  console.log(`${color}[${MARK[c.status]}]${reset} ${c.label} — ${c.detail}`);
  if (c.fix) console.log(`        ${dim}fix: ${c.fix}${reset}`);
}

async function main() {
  const configChecks = buildConfigChecks(snapshotFromEnv());

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin =
    url && serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  const dbChecks = await runDatabaseChecks(admin);

  const report = summarize([...configChecks, ...dbChecks]);

  console.log("\nAutomazing diagnostics\n");
  console.log("Configuration:");
  for (const c of configChecks) line(c);
  console.log("\nDatabase schema:");
  for (const c of dbChecks) line(c);

  const { ok, warn, error } = report.summary;
  console.log(`\n${error === 0 ? "\x1b[32m" : "\x1b[31m"}${error} error · ${warn} warning · ${ok} ok\x1b[0m`);
  if (error > 0) {
    console.log("\nFix the FAIL items above before this environment is healthy.");
  }
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("diagnose crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
