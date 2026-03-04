#!/usr/bin/env node
/**
 * Avslutar process som lyssnar på port 3001 (t.ex. gammal server utan .env).
 * Kör: node scripts/kill-port-3001.js
 * Eller: npm run dev:kill-port
 */
import { execSync } from "child_process";
import process from "process";

const port = 3001;
const isWin = process.platform === "win32";

try {
  if (isWin) {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    const lines = out.trim().split("\n").filter((l) => l.includes("LISTENING"));
    const pids = new Set();
    for (const line of lines) {
      const m = line.trim().split(/\s+/);
      const pid = m[m.length - 1];
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "inherit" });
      console.log("Avslutade process", pid, "på port", port);
    }
    if (pids.size === 0) console.log("Ingen process hittades på port", port);
  } else {
    execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: "inherit" });
    console.log("Avslutade process(er) på port", port);
  }
} catch (e) {
  if (e.status === 1 || e.code === 1 || (e.message && e.message.includes("findstr"))) console.log("Ingen process på port", port);
  else throw e;
}
