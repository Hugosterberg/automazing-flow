import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The jsdom environment has a slow cold start that occasionally trips the
    // default per-file timeout on the first run (flaky "no tests" failures).
    // Generous timeouts make runs deterministic so a real failure is never
    // masked by a startup flake.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    teardownTimeout: 20_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
