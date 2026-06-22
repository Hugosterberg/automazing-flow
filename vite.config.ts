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
            if (!id.includes("node_modules")) {
              return;
            }

            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
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

            // recharts (+ its d3 dependency tree) is ~300 kB and only changes
            // when the dependency is bumped — keep it out of page chunks so
            // Ecommerce/analytics pages stay small and the vendor chunk stays
            // cached across deploys.
            if (
              id.includes("/recharts/") ||
              id.includes("/d3-") ||
              id.includes("/victory-vendor/")
            ) {
              return "charts-vendor";
            }

            if (id.includes("/@supabase/")) {
              return "supabase-vendor";
            }
          },
        },
      },
    },
  };
});
