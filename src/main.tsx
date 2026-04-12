import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { postAgentDebugIngest } from "@/lib/agentDebugIngest";

// #region agent log
postAgentDebugIngest({
  sessionId: "3f6df6",
  runId: "post-change",
  hypothesisId: "A5",
  location: "main.tsx:bootstrap",
  message: "Frontend bootstrap reached",
  data: { hasRoot: Boolean(document.getElementById("root")) },
  timestamp: Date.now(),
});
// #endregion

createRoot(document.getElementById("root")!).render(<App />);
