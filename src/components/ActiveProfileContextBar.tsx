import { Building2, Link2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAccounts } from "@/context/AccountsContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Always-visible reminder which business profile the main app chrome applies to.
 */
export function ActiveProfileContextBar() {
  const { activeProfile, profiles, accounts, profilesReady } = useAccounts();

  if (!profilesReady) {
    return (
      <div className="flex flex-1 items-center gap-3 min-w-0 ml-2 mr-4">
        <Skeleton className="h-9 flex-1 max-w-md rounded-lg" />
      </div>
    );
  }

  if (profiles.length === 0) {
    return null;
  }

  const channelCount = accounts.length;

  return (
    <div className="flex flex-1 items-center gap-2 sm:gap-3 min-w-0 ml-2 mr-4">
      <div
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border/70 bg-muted/35 px-2.5 py-1.5 sm:px-3 sm:py-2 max-w-xl"
        role="status"
        aria-live="polite"
        aria-label={`Active business profile: ${activeProfile?.name ?? "none"}`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80 border border-border/50">
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-none">
            Working as
          </p>
          <p className="truncate text-sm font-semibold leading-tight mt-1">{activeProfile?.name ?? "—"}</p>
          {activeProfile?.company ? (
            <p className="truncate text-xs text-muted-foreground leading-tight">{activeProfile.company}</p>
          ) : null}
        </div>
        {profiles.length > 1 ? (
          <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs" asChild>
            <Link to="/">Switch</Link>
          </Button>
        ) : null}
      </div>

      <div className="hidden md:flex flex-col items-end shrink-0 text-right">
        <span className="text-xs text-muted-foreground tabular-nums">
          {channelCount} channel{channelCount === 1 ? "" : "s"}
        </span>
        <span className="text-[10px] text-muted-foreground/80 max-w-[140px] truncate">this profile only</span>
      </div>

      <Button variant="outline" size="sm" className="hidden sm:inline-flex shrink-0 gap-1.5 h-8" asChild>
        <Link to="/connect-accounts" title="See what is linked and what is still missing">
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          Connections
        </Link>
      </Button>
    </div>
  );
}
