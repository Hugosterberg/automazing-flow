import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { LazyMotion, domAnimation, MotionConfig } from "framer-motion";
import { AccountsProvider } from "@/context/AccountsContext";
import { AuthProvider } from "@/context/AuthContext";
import { AuthGate } from "@/components/AuthGate";
import { ActiveBusinessProfileProvider, ActiveProfileGuard } from "@/features/business-profiles";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import Index from "./pages/Index";
import Layout from "./components/Layout";

/*
 * Route-level code splitting. Each feature page becomes its own chunk so
 * the initial bundle only pays for the auth gate, layout chrome and the
 * landing page. Everything else streams in on navigation.
 *
 * Kept eagerly imported:
 *   - `Index` (landing page — always the first paint after sign-in)
 *   - `Layout`, providers, `AuthGate` (chrome rendered on every route)
 */
const NotFound = lazy(() => import("./pages/NotFound"));
const SocialMedia = lazy(() => import("./pages/SocialMedia"));
const Ecommerce = lazy(() => import("./pages/Ecommerce"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const MessagesPage = lazy(() => import("./pages/Messages"));
const AIRecommendationsPage = lazy(() => import("./pages/AIRecommendations"));
const PreferencesPage = lazy(() => import("./pages/Preferences"));
const ReviewsPage = lazy(() => import("./pages/Reviews"));
const SalesMarketingPage = lazy(() => import("./pages/SalesMarketing"));
const MarketingPage = lazy(() => import("./pages/Marketing"));
const DigitalBrandPage = lazy(() => import("./pages/DigitalBrand"));
const CustomersPage = lazy(() => import("./pages/Customers"));
const ContentPage = lazy(() => import("./pages/Content"));
const ConnectionsPage = lazy(() => import("./pages/ConnectionsPage"));
const TasksPage = lazy(() => import("./pages/Tasks"));
const ActivityPage = lazy(() => import("./pages/Activity"));

/**
 * Shared fallback while a lazy route chunk is streaming in. Kept quiet
 * so fast transitions do not flash a busy UI; the spinner only becomes
 * visible on genuinely slow loads (cold cache, poor network).
 */
function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="sr-only">Loading page…</span>
    </div>
  );
}

/**
 * Full-screen fallback for crashes that escape every in-app boundary
 * (typically at the provider level, before a layout renders). At this
 * point the sidebar is unavailable, so we offer a hard reload instead
 * of the in-place retry used by the route-level boundary.
 */
function RootErrorFallback({ error }: { error: Error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-md space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <div className="inline-flex items-center justify-center rounded-full bg-destructive/10 p-3">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
        </div>
        <h1 className="text-base font-semibold text-foreground">The app couldn't start</h1>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred before the page could render. Try reloading.
        </p>
        {import.meta.env.DEV ? (
          <pre className="max-h-40 overflow-auto rounded-md bg-muted/40 p-2 text-left text-[11px] text-muted-foreground">
            {error.message}
          </pre>
        ) : null}
        <Button type="button" size="sm" onClick={() => window.location.reload()} className="mx-auto">
          <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden />
          Reload
        </Button>
      </div>
    </div>
  );
}

const App = () => {
  return (
    <ErrorBoundary label="root" fallback={({ error }) => <RootErrorFallback error={error} />}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthGate>
              <ActiveBusinessProfileProvider>
                <AccountsProvider>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route
                      element={
                        <ActiveProfileGuard>
                          <Layout />
                        </ActiveProfileGuard>
                      }
                    >
                      <Route path="/" element={<Index />} />
                      <Route path="/social-media" element={<SocialMedia />} />
                      <Route path="/ecommerce" element={<Ecommerce />} />
                      <Route path="/sales" element={<SalesMarketingPage />} />
                      <Route path="/marketing" element={<MarketingPage />} />
                      <Route path="/digital-brand" element={<DigitalBrandPage />} />
                      <Route path="/sales-marketing" element={<Navigate to="/sales" replace />} />
                      <Route path="/customers" element={<CustomersPage />} />
                      <Route path="/calendar" element={<CalendarPage />} />
                      <Route path="/messages" element={<MessagesPage />} />
                      <Route path="/mail" element={<Navigate to="/messages" replace />} />
                      <Route path="/reviews" element={<ReviewsPage />} />
                      <Route path="/content" element={<ContentPage />} />
                      <Route path="/tasks" element={<TasksPage />} />
                      <Route path="/activity" element={<ActivityPage />} />
                      <Route path="/ai-recommendations" element={<AIRecommendationsPage />} />
                      <Route path="/preferences" element={<PreferencesPage />} />
                      <Route path="/connections" element={<ConnectionsPage />} />
                      <Route path="/integrations" element={<ConnectionsPage />} />
                      {/*
                       * Back-compat redirects. `/connect-accounts` lives on
                       * because the server's OAuth layer (see oauthRoutes.ts)
                       * still accepts `oauth_return=connect-accounts` from
                       * legacy provider configurations.
                       */}
                      <Route path="/connect-accounts" element={<Navigate to="/connections" replace />} />
                      <Route path="/integrations/legacy" element={<Navigate to="/connections" replace />} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
                </AccountsProvider>
              </ActiveBusinessProfileProvider>
            </AuthGate>
          </BrowserRouter>
        </TooltipProvider>
        </MotionConfig>
        </LazyMotion>
      </AuthProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
