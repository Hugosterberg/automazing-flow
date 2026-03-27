import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { AccountsProvider } from "@/context/AccountsContext";
import { AuthProvider } from "@/context/AuthContext";
import { AuthGate } from "@/components/AuthGate";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Layout from "./components/Layout";
import SocialMedia from "./pages/SocialMedia";
import Ecommerce from "./pages/Ecommerce";
import CalendarPage from "./pages/CalendarPage";
import MailPage from "./pages/Mail";
import AIRecommendationsPage from "./pages/AIRecommendations";
import PreferencesPage from "./pages/Preferences";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    const payload = {
      sessionId: "3f6df6",
      runId: "post-change",
      hypothesisId: "A1",
      location: "App:mount",
      message: "App mounted global logging check",
      data: { path: window.location.pathname, method: "fetch+beacon" },
      timestamp: Date.now(),
    };
    // #region agent log
    fetch("http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3f6df6" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon("http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c", blob);
    } catch {
      // ignore beacon errors
    }
    // #endregion
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthGate>
              <AccountsProvider>
                <Routes>
                <Route path="/" element={<Index />} />
                <Route element={<Layout />}>
                  <Route path="/social-media" element={<SocialMedia />} />
                  <Route path="/ecommerce" element={<Ecommerce />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/mail" element={<MailPage />} />
                  <Route path="/ai-recommendations" element={<AIRecommendationsPage />} />
                  <Route path="/preferences" element={<PreferencesPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
                </Routes>
              </AccountsProvider>
            </AuthGate>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
