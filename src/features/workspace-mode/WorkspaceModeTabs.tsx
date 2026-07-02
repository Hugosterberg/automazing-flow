import { Briefcase, Loader2, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWorkspaceMode } from "./useWorkspaceMode";
import { isNavUrlAllowedInMode } from "@/components/navConfig";
import type { WorkspaceMode } from "./workspaceMode";

const TABS: Array<{
  mode: WorkspaceMode;
  label: string;
  icon: typeof User;
}> = [
  { mode: "private", label: "Private", icon: User },
  { mode: "business", label: "Business", icon: Briefcase },
];

/**
 * Minimal segmented control in the app header that switches between the
 * Private and Business workspaces. The active tab mirrors the active
 * profile's kind; clicking the other tab activates (or creates) a profile
 * of that kind. If the current page doesn't exist in the target mode we
 * land on Home instead of a hidden route.
 */
export function WorkspaceModeTabs() {
  const { mode, setMode, switching } = useWorkspaceMode();
  const navigate = useNavigate();

  function handleSelect(target: WorkspaceMode) {
    if (target === mode) return;
    setMode(target);
    if (!isNavUrlAllowedInMode(window.location.pathname, target)) {
      navigate("/");
    }
  }

  return (
    <div
      role="group"
      aria-label="Workspace"
      className="flex shrink-0 items-center rounded-full border border-border/60 bg-muted/40 p-0.5"
    >
      {TABS.map(({ mode: tabMode, label, icon: Icon }) => {
        const isActive = mode === tabMode;
        const isBusy = switching && !isActive;
        return (
          <button
            key={tabMode}
            type="button"
            onClick={() => handleSelect(tabMode)}
            disabled={switching}
            aria-pressed={isActive}
            className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 sm:px-3 text-xs font-medium transition-colors ${
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
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
