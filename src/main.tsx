import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initI18n } from "./lib/i18n";
import "./index.css";

// Language must be resolved before first render (no flash of wrong language).
initI18n();

/**
 * React error boundaries cannot catch unhandled promise rejections
 * (uncaught async errors). Without a listener these are silently dropped
 * in production. Logging them here keeps them visible and gives us one
 * place to wire up an error tracker later.
 */
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[unhandledrejection]", event.reason);
  });
}

createRoot(document.getElementById("root")!).render(<App />);

/**
 * Register the PWA service worker in production builds only. In dev, Vite's
 * module server + HMR don't play well with a caching SW, so we skip it.
 */
if (import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[pwa] service worker registration failed:", err);
    });
  });
}
