import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = process.env.PORT || env.PORT || "3001";
  const apiTarget = `http://127.0.0.1:${apiPort}`;

  const vercelUrl = process.env.VERCEL_URL || "";
  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
  const vercelDeploymentOrigin =
    vercelUrl.length > 0
      ? vercelUrl.includes("://")
        ? vercelUrl
        : `https://${vercelUrl}`
      : "";
  const vercelProductionOrigin =
    vercelProductionUrl.length > 0
      ? vercelProductionUrl.includes("://")
        ? vercelProductionUrl
        : `https://${vercelProductionUrl}`
      : "";

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [react()],
    define: {
      // Vercel host metadata for auth callback canonicalization.
      "import.meta.env.VITE_VERCEL_DEPLOYMENT_ORIGIN": JSON.stringify(vercelDeploymentOrigin),
      "import.meta.env.VITE_VERCEL_PRODUCTION_ORIGIN": JSON.stringify(vercelProductionOrigin),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      // Pull heavy, rarely-changing dependencies into their own chunks so
      // they stay cached across app deploys. Route-level code splitting
      // happens via React.lazy in src/App.tsx — this config only controls
      // how the shared dependency graph is partitioned.
      rollupOptions: {
        output: {
          manualChunks(id) {
            /*
             * Vite's dynamic-import preload helper is a virtual module, so it
             * never matches the node_modules rules below. Left unassigned,
             * Rollup parked it in the chart vendor chunk — and since the entry
             * needs the helper, that made all 395 kB of recharts a first-paint
             * dependency. Pinning it next to React keeps it in a chunk the
             * entry loads anyway.
             */
            if (id.includes("vite/preload-helper")) {
              return "react-vendor";
            }

            if (!id.includes("node_modules")) {
              return;
            }

            // `react-is` is claimed here so it cannot be stranded inside a
            // heavy chunk it happens to share with a charting dependency.
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/react-is/") ||
              id.includes("/react-router-dom/")
            ) {
              return "react-vendor";
            }

            if (id.includes("/@tanstack/react-query/")) {
              return "query-vendor";
            }

            if (id.includes("/framer-motion/")) {
              return "framer-vendor";
            }

            if (id.includes("/@radix-ui/")) {
              return "radix-vendor";
            }

            /*
             * recharts (+ its d3 tree) is ~395 kB and only used by four lazy
             * routes. It is deliberately NOT grouped into a manual chunk:
             * a hand-named chunk collects whatever shared modules Rollup
             * decides to park in it, and a single one of those reached from
             * the app shell turns the whole 395 kB into a first-paint
             * dependency. Letting Rollup derive the chunk keeps it reachable
             * only from the routes that actually render a chart.
             */

            if (id.includes("/@supabase/")) {
              return "supabase-vendor";
            }

            // Icons are referenced from nearly every page — one cacheable
            // chunk keeps them out of the shared app-code chunk.
            if (id.includes("/lucide-react/")) {
              return "icons-vendor";
            }
          },
        },
      },
    },
  };
});
