import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AccountsProvider } from "@/context/AccountsContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Layout from "./components/Layout";
import SocialMedia from "./pages/SocialMedia";
import Ecommerce from "./pages/Ecommerce";
import CalendarPage from "./pages/CalendarPage";
import MailPage from "./pages/Mail";
import PreferencesPage from "./pages/Preferences";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AccountsProvider>
          <Routes>
          <Route path="/" element={<Index />} />
          <Route element={<Layout />}>
            <Route path="/social-media" element={<SocialMedia />} />
            <Route path="/ecommerce" element={<Ecommerce />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/mail" element={<MailPage />} />
            <Route path="/preferences" element={<PreferencesPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
          </Routes>
        </AccountsProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
