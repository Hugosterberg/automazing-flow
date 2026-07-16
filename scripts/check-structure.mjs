/**
 * Maintainability guardrails for the modularized codebase.
 * Fails CI/verify when god-files regrow or cron wiring drifts from vercel.json.
 *
 * Usage: node scripts/check-structure.mjs
 */

import fs from "fs";
import path from "path";

const root = process.cwd();
const errors = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function lineCount(rel) {
  return read(rel).split(/\r?\n/).length;
}

function listFiles(dir, ext) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((f) => f.endsWith(ext));
}

function cronModulesContain(pathStr) {
  return listFiles("server/routes/cron", ".js").some((f) => {
    const src = read(path.join("server/routes/cron", f));
    return src.includes(`"${pathStr}"`) || src.includes(`'${pathStr}'`);
  });
}

/** Soft budgets — fail if exceeded (keeps pages/routers composition-focused). */
const FILE_BUDGETS = [
  { file: "src/pages/Messages.tsx", max: 1000 },
  { file: "src/pages/Content.tsx", max: 900 },
  { file: "src/pages/Ecommerce.tsx", max: 900 },
  { file: "src/pages/CalendarPage.tsx", max: 900 },
  { file: "server/routes/oauthRoutes.ts", max: 700 },
  { file: "server/routes/cronRoutes.js", max: 550 },
];

/** Wiring files should not grow new inline handlers — those belong in modules. */
const NO_INLINE_HANDLERS = [
  {
    file: "server/routes/cronRoutes.js",
    forbidden: /app\.get\s*\(\s*["'`]\/api\/cron\//,
    hint: "Add a module under server/routes/cron/ and call register*Cron from cronRoutes.js",
  },
  {
    file: "server/routes/oauthRoutes.ts",
    forbidden: /app\.get\s*\(\s*["'`]\/api\/auth\//,
    hint: "Add a module under server/routes/oauth/ and call register*OAuthRoutes from oauthRoutes.ts",
  },
];

const MIN_CRON_MODULES = 15;
const MIN_OAUTH_MODULES = 12;

for (const { file, max } of FILE_BUDGETS) {
  if (!fs.existsSync(path.join(root, file))) {
    errors.push(`missing budgeted file: ${file}`);
    continue;
  }
  const lines = lineCount(file);
  if (lines > max) {
    errors.push(`${file} has ${lines} lines (budget ${max}). Extract before growing further.`);
  }
}

for (const { file, forbidden, hint } of NO_INLINE_HANDLERS) {
  const src = read(file);
  if (forbidden.test(src)) {
    errors.push(`${file} contains inline app.get handlers. ${hint}`);
  }
}

const cronMods = listFiles("server/routes/cron", ".js").length;
const oauthMods = listFiles("server/routes/oauth", ".ts").length;
if (cronMods < MIN_CRON_MODULES) {
  errors.push(`expected >= ${MIN_CRON_MODULES} cron modules, found ${cronMods}`);
}
if (oauthMods < MIN_OAUTH_MODULES) {
  errors.push(`expected >= ${MIN_OAUTH_MODULES} oauth modules, found ${oauthMods}`);
}

/** Every vercel.json cron path must be registered in a cron module. */
const vercel = JSON.parse(read("vercel.json"));
const cronPaths = Array.isArray(vercel.crons) ? vercel.crons.map((c) => c.path) : [];
for (const p of cronPaths) {
  if (!cronModulesContain(p)) {
    errors.push(`vercel.json cron ${p} is not registered in server/routes/cron/*`);
  }
}

if (errors.length) {
  console.error("Structure check failed:\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("Structure check OK");
console.log(`  budgets: ${FILE_BUDGETS.length} files`);
console.log(`  cron modules: ${cronMods}, oauth modules: ${oauthMods}`);
console.log(`  vercel crons verified: ${cronPaths.length}`);
