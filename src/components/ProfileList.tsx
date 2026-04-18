import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAccounts } from "@/context/AccountsContext";

export function ProfileList() {
  const { profiles, activeProfileId, setActiveProfileId, addProfile, allAccounts } = useAccounts();

  function connectedCount(profileId: string) {
    return allAccounts.filter((a) => a.profileId === profileId && !a.disconnectedAt).length;
  }
  const [newName, setNewName] = useState("");
  const [showInput, setShowInput] = useState(false);

  function handleAddProfile() {
    const name = newName.trim() || "New profile";
    addProfile(name);
    setNewName("");
    setShowInput(false);
  }

  return (
    <div className="w-full max-w-2xl space-y-3">
      <div className="text-center space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Business profiles</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          One login—separate spaces per brand or client. Channels and picks stay inside each profile.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-secondary/30 overflow-hidden">
        <div className="flex items-stretch overflow-x-auto">
          {profiles.map((profile) => {
            const isSelected = activeProfileId === profile.id;
            const n = connectedCount(profile.id);
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => setActiveProfileId(profile.id)}
                className={`flex items-center justify-center gap-2 w-44 min-w-44 px-3 py-2.5 text-sm transition-colors border-r border-border ${
                  isSelected
                    ? "bg-accent text-foreground font-medium"
                    : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/70"
                }`}
                aria-pressed={isSelected}
              >
                <span className="truncate">{profile.name}</span>
                <Badge
                  variant={isSelected ? "default" : "secondary"}
                  className="h-5 min-w-5 px-1.5 tabular-nums text-[11px] shrink-0"
                >
                  {n}
                </Badge>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowInput((s) => !s)}
            className="flex items-center justify-center gap-1 w-40 min-w-40 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/70 border-l border-border"
            aria-label="Add profile"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      {showInput && (
        <div className="flex gap-2">
          <Input
            placeholder="New profile name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddProfile();
              if (e.key === "Escape") setShowInput(false);
            }}
            className="h-8"
            autoFocus
          />
          <Button size="sm" onClick={handleAddProfile}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
