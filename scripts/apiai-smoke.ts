/**
 * Smoke test the apiai.me integration the same way automazing uses it.
 *
 * Probes https://apiai.me/api with APIAI_API_KEY and prints a precise verdict:
 * key present? host reachable? key accepted? how many tools are available?
 *
 * Run: node --experimental-strip-types scripts/apiai-smoke.ts
 *
 * Exit codes:
 *   0  healthy, OR no key configured (skipped — keeps CI green by default)
 *   1  key configured but apiai.me is unreachable / rejected the key
 */

import { config } from "dotenv";
import { checkApiaiHealth } from "../server/providers/apiai.ts";

// Vite convention: .env.local overrides .env. dotenv won't clobber vars that
// are already set in the real environment (e.g. CI secrets).
config({ path: ".env.local" });
config();

async function main() {
  const apiKey = (process.env.APIAI_API_KEY || "").trim();

  if (!apiKey) {
    console.log("[SKIP] APIAI_API_KEY not set — skipping apiai.me smoke test.");
    console.log("       Set it in .env.local or the environment to run a live check.");
    process.exit(0);
  }

  console.log("[apiai] Probing https://apiai.me/api …");
  const health = await checkApiaiHealth(apiKey);

  console.log(`  key configured : ${health.keyConfigured}`);
  console.log(`  reachable      : ${health.reachable}`);
  console.log(`  authorized     : ${health.authorized}`);
  console.log(`  http status    : ${health.status ?? "—"}`);
  console.log(`  latency        : ${health.latencyMs != null ? `${health.latencyMs} ms` : "—"}`);
  console.log(`  tools          : ${health.toolCount} (${health.workflowCount} workflows, ${health.flowCount} flows)`);
  if (health.sampleTools.length > 0) {
    console.log("  sample tools   :");
    for (const t of health.sampleTools) {
      console.log(`    - [${t.type}] ${t.slug} — ${t.name}`);
    }
  }

  if (!health.ok) {
    console.error(`\n[FAIL] ${health.error}`);
    process.exit(1);
  }

  console.log("\n[OK] apiai.me is reachable and the API key works.");
  process.exit(0);
}

main().catch((error) => {
  console.error("[FAIL] Unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
