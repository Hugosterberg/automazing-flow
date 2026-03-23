import { useState } from "react";
import { Building2, Plus, CheckCircle2 } from "lucide-react";
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
    <div className="w-full max-w-md space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Your profiles
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setShowInput((s) => !s)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {profiles.map((profile) => {
          const isSelected = activeProfileId === profile.id;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => setActiveProfileId(profile.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                isSelected
                  ? "bg-accent text-foreground"
                  : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {isSelected ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <span className="w-4 shrink-0" aria-hidden />
              )}
              {profile.name}
            </button>
          );
        })}
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
