import { Building2, ChevronDown, Check } from "lucide-react";
import { useState } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Always-visible reminder which business profile the main app chrome applies to.
 */
export function ActiveProfileContextBar() {
  const { activeProfile, profiles, accounts, setActiveProfileId, profilesReady } = useAccounts();
  const [open, setOpen] = useState(false);

  if (!profilesReady) {
    return (
      <div className="flex flex-1 items-center gap-3 min-w-0 ml-2 mr-4">
        <Skeleton className="h-8 flex-1 max-w-xs rounded-md" />
      </div>
    );
  }

  if (profiles.length === 0) {
    return null;
  }

  const channelCount = accounts.length;

  const handleSelectProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    setOpen(false);
  };

  return (
    <div className="flex flex-1 items-center gap-2 sm:gap-3 min-w-0 ml-2 mr-4">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 px-3 bg-muted/30 border-border/50 hover:bg-muted/50"
            aria-label={`Active profile: ${activeProfile?.name ?? "none"}. Click to change profile`}
          >
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium truncate">{activeProfile?.name ?? "—"}</span>
            {profiles.length > 1 && <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
          </Button>
        </PopoverTrigger>
        {profiles.length > 1 && (
          <PopoverContent className="w-48 p-2" align="start">
            <div className="space-y-1">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => handleSelectProfile(profile.id)}
                  className="w-full flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50 transition-colors"
                >
                  <span className="truncate font-medium">{profile.name}</span>
                  {profile.id === activeProfile?.id && <Check className="h-4 w-4 shrink-0 text-accent-foreground" aria-hidden />}
                </button>
              ))}
            </div>
          </PopoverContent>
        )}
      </Popover>

      <div className="hidden md:flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground">
          {channelCount} connection{channelCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
