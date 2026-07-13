import { Building2, ChevronDown, Check, User } from "lucide-react";
import { useState } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { isPersonalProfile, profileMatchesMode, useWorkspaceMode } from "@/features/workspace-mode";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Always-visible reminder which business profile the main app chrome applies to.
 */
export function ActiveProfileContextBar() {
  const { activeProfile, profiles, accounts, setActiveProfileId, profilesReady } = useAccounts();
  const { mode } = useWorkspaceMode();
  const [open, setOpen] = useState(false);

  const modeProfiles = profiles.filter((p) => profileMatchesMode(p, mode));
  const ProfileIcon = isPersonalProfile(activeProfile) ? User : Building2;

  if (!profilesReady) {
    return (
      <div className="flex flex-1 items-center gap-2 min-w-0 ml-1 mr-1 sm:ml-2 sm:mr-2">
        <Skeleton className="h-8 w-8 rounded-md sm:flex-1 sm:max-w-xs" />
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
    <div className="flex flex-1 items-center gap-1.5 min-w-0 ml-1 mr-1 sm:gap-2 sm:ml-2 sm:mr-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 shrink min-w-0 bg-muted/30 border-border/50 hover:bg-muted/50 active:scale-[0.98]",
              "gap-1.5 px-2.5 touch-manipulation sm:h-8 sm:gap-2 sm:px-3"
            )}
            aria-label={`Aktiv profil: ${activeProfile?.name ?? "ingen"}. Klicka för att byta`}
          >
            <ProfileIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="hidden max-w-[120px] truncate text-sm font-medium sm:inline md:max-w-[180px]">
              {activeProfile?.name ?? "—"}
            </span>
            {modeProfiles.length > 1 ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
          </Button>
        </PopoverTrigger>
        {modeProfiles.length > 1 ? (
          <PopoverContent className="w-[min(calc(100vw-2rem),14rem)] p-2" align="start">
            <div className="space-y-1">
              {modeProfiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => handleSelectProfile(profile.id)}
                  className="w-full flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50 transition-colors"
                >
                  <span className="truncate font-medium">{profile.name}</span>
                  {profile.id === activeProfile?.id ? (
                    <Check className="h-4 w-4 shrink-0 text-accent-foreground" aria-hidden />
                  ) : null}
                </button>
              ))}
            </div>
            <p className="mt-2 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
              {channelCount} koppling{channelCount === 1 ? "" : "ar"}
            </p>
          </PopoverContent>
        ) : null}
      </Popover>

      <div className="hidden lg:flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground">
          {channelCount} koppling{channelCount === 1 ? "" : "ar"}
        </span>
      </div>
    </div>
  );
}
