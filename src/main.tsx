import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// #region agent log
fetch("http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3f6df6" },
  body: JSON.stringify({
    sessionId: "3f6df6",
    runId: "post-change",
    hypothesisId: "A5",
    location: "main.tsx:bootstrap",
    message: "Frontend bootstrap reached",
    data: { hasRoot: Boolean(document.getElementById("root")) },
    timestamp: Date.now(),
  }),
  keepalive: true,
}).catch(() => {});
// #endregion

createRoot(document.getElementById("root")!).render(<App />);
