import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ActiveProfileContextBar } from "@/components/ActiveProfileContextBar";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationsBell } from "@/features/activity";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Settings, Terminal, User as UserIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { isLocalDevHost } from "@/lib/deployment";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * Pick a stable single-character fallback for the avatar badge.
 * Uses the first character of the email local-part; falls back to a
 * neutral glyph when the user has no email on the profile.
 */
function emailInitial(email: string | null | undefined): string {
  if (!email) return "·";
  const trimmed = email.trim();
  if (!trimmed) return "·";
  return trimmed[0]!.toUpperCase();
}

export default function Layout() {
  const { user, signOut, authMode, setAuthMode } = useAuth();
  const allowLocal = isLocalDevHost();
  const email = user?.email ?? null;
  const location = useLocation();
  useDocumentTitle();

  return (
    <SidebarProvider>
      {/*
       * Skip-to-content shortcut. Hidden off-screen until it receives
       * keyboard focus (first Tab press), then pops into view. Lets
       * keyboard and screen-reader users bypass the sidebar + header
       * and jump straight into the page body.
       */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="sticky top-0 z-30 glass safe-top safe-x flex h-14 items-center border-b border-border px-3 sm:px-4 gap-2 min-w-0">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground shrink-0" />
            <ActiveProfileContextBar />
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <CommandPalette />
              <NotificationsBell />
              {authMode === "cloud" ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-full border border-border bg-card/40 pl-1 pr-2 py-1 hover:bg-accent/40 transition-colors"
                      aria-label="Open account menu"
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[11px] font-semibold">
                          {emailInitial(email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden sm:inline text-xs text-muted-foreground max-w-[160px] truncate">
                        {user?.user_metadata?.full_name ?? email ?? "Inloggad"}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[220px]">
                    <DropdownMenuLabel className="flex items-start gap-2">
                      <UserIcon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {user?.user_metadata?.full_name ?? email ?? "Inloggad"}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {email ?? "Cloud-konto"}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="text-xs">
                      <Link to="/preferences">
                        <Settings className="h-3.5 w-3.5 mr-2" />
                        Inställningar
                      </Link>
                    </DropdownMenuItem>
                    {allowLocal ? (
                      <DropdownMenuItem
                        onSelect={() => setAuthMode("local")}
                        className="text-xs"
                      >
                        <Terminal className="h-3.5 w-3.5 mr-2" />
                        Lokalt läge
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => void signOut()}
                      className="text-xs text-destructive focus:text-destructive"
                    >
                      <LogOut className="h-3.5 w-3.5 mr-2" />
                      Logga ut
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">Local mode</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAuthMode("cloud")}
                    title="Use Supabase Google sign-in and synced profiles"
                  >
                    Use Google
                  </Button>
                </>
              )}
            </div>
          </header>
          <div
            id="main-content"
            tabIndex={-1}
            className="flex-1 overflow-auto app-scroll focus:outline-none safe-bottom safe-x"
          >
            <div className="mx-auto w-full max-w-screen-2xl p-4 sm:p-6">
              <ErrorBoundary resetKey={location.pathname} label="route">
                <Outlet />
              </ErrorBoundary>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
