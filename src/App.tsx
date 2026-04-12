import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import MessagesPage from "./pages/Messages";
import AIRecommendationsPage from "./pages/AIRecommendations";
import PreferencesPage from "./pages/Preferences";
import ReviewsPage from "./pages/Reviews";
import SalesMarketingPage from "./pages/SalesMarketing";
import CustomersPage from "./pages/Customers";
import ContentPage from "./pages/Content";
import { postAgentDebugIngest, sendAgentDebugBeacon } from "@/lib/agentDebugIngest";

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
    postAgentDebugIngest(payload);
    sendAgentDebugBeacon(payload);
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
                  <Route path="/sales-marketing" element={<SalesMarketingPage />} />
                  <Route path="/customers" element={<CustomersPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/messages" element={<MessagesPage />} />
                  <Route path="/mail" element={<Navigate to="/messages" replace />} />
                  <Route path="/reviews" element={<ReviewsPage />} />
                  <Route path="/content" element={<ContentPage />} />
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
