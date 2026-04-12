import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
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
          <header className="h-14 flex items-center border-b border-border px-4">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div className="ml-auto flex items-center gap-3">
              {authMode === "cloud" ? (
                <>
                  <span className="text-xs text-muted-foreground">{user?.email}</span>
                  {allowLocal ? (
                    <Button variant="outline" size="sm" onClick={() => setAuthMode("local")}>
                      Local mode
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => void signOut()}>
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">Local mode</span>
                  <Button variant="outline" size="sm" onClick={() => setAuthMode("cloud")}>
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
