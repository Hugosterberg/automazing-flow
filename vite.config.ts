import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.PORT || "3001";
  const apiTarget = `http://127.0.0.1:${apiPort}`;

  const vercelUrl = process.env.VERCEL_URL || "";
  const vercelDeploymentOrigin =
    vercelUrl.length > 0
      ? vercelUrl.includes("://")
        ? vercelUrl
        : `https://${vercelUrl}`
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
      // OAuth redirect base on Vercel builds (VERCEL_URL is set by the platform).
      "import.meta.env.VITE_VERCEL_DEPLOYMENT_ORIGIN": JSON.stringify(vercelDeploymentOrigin),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
