import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
