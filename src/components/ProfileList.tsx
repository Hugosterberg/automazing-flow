import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/context/AccountsContext";

export function ProfileList() {
  const { profiles, activeProfileId, setActiveProfileId, addProfile } = useAccounts();
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
      <div className="rounded-lg border border-border bg-secondary/30 overflow-hidden">
        <div className="flex items-stretch overflow-x-auto">
          {profiles.map((profile) => {
            const isSelected = activeProfileId === profile.id;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => setActiveProfileId(profile.id)}
                className={`flex items-center justify-center gap-2 w-40 min-w-40 px-3 py-2 text-sm transition-colors border-r border-border ${
                  isSelected
                    ? "bg-accent text-foreground font-medium"
                    : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/70"
                }`}
                aria-pressed={isSelected}
              >
                <span className="truncate">{profile.name}</span>
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
