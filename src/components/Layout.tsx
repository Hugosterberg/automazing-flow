import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ActiveProfileContextBar } from "@/components/ActiveProfileContextBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { isLocalDevHost } from "@/lib/deployment";
import { Outlet } from "react-router-dom";

export default function Layout() {
  const { user, signOut, authMode, setAuthMode } = useAuth();
  const allowLocal = isLocalDevHost();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="flex h-14 items-center border-b border-border px-3 sm:px-4 gap-2 min-w-0">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground shrink-0" />
            <ActiveProfileContextBar />
            <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
              {authMode === "cloud" ? (
                <>
                  <span className="text-xs text-muted-foreground">{user?.email}</span>
                  {allowLocal ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAuthMode("local")}
                      title="Switch to browser-local session (OAuth still needs the same browser)"
                    >
                      Local mode
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => void signOut()} title="Sign out of Google and clear app session cookie">
                    Sign out
                  </Button>
                </>
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
          <div className="flex-1 p-6 overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
