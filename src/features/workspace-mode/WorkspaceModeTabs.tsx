import { Briefcase, Loader2, User } from "lucide-react";
import { useWorkspaceMode } from "./useWorkspaceMode";
import type { WorkspaceMode } from "./workspaceMode";

const TABS: Array<{
  mode: WorkspaceMode;
  icon: typeof User;
}> = [
  { mode: "private", icon: User },
  { mode: "business", icon: Briefcase },
];

/**
 * Minimal segmented control in the app header that switches between the
 * Private and Business workspaces. The active tab mirrors the active
 * profile's kind; clicking the other tab activates (or creates) a profile
 * of that kind. Layout's mode fence handles redirecting away from pages
 * that don't exist in the target mode.
 */
export function WorkspaceModeTabs() {
  const { mode, setMode, switching } = useWorkspaceMode();

  return (
    <div
      role="group"
      aria-label="Workspace"
      className="flex shrink-0 items-center rounded-full border border-border/60 bg-muted/40 p-0.5"
    >
      {TABS.map(({ mode: tabMode, icon: Icon }) => {
        const isActive = mode === tabMode;
        const isBusy = switching && !isActive;
        return (
          <button
            key={tabMode}
            type="button"
            onClick={() => setMode(tabMode)}
            disabled={switching}
            aria-pressed={isActive}
            className={`flex h-8 items-center gap-1 rounded-full px-2 sm:h-7 sm:gap-1.5 sm:px-3 text-xs font-medium transition-colors ${
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Icon className="h-3.5 w-3.5" aria-hidden />
            )}
            <span>{tabMode === "private" ? "Privat" : "Business"}</span>
          </button>
        );
      })}
    </div>
  );
}
