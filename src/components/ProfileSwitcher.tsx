import { useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAccounts } from "@/context/AccountsContext";

function ProfileInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileSwitcher() {
  const {
    profiles,
    activeProfile,
    setActiveProfileId,
    addProfile,
    renameProfile,
    removeProfile,
    allAccounts,
  } = useAccounts();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [open, setOpen] = useState(false);

  function handleAddProfile() {
    const name = newName.trim() || "New profile";
    addProfile(name);
    setNewName("");
  }

  function handleSaveRename() {
    if (editingId) {
      renameProfile(editingId, editName);
      setEditingId(null);
    }
  }

  function getAccountCount(profileId: string) {
    return allAccounts.filter((a) => a.profileId === profileId && !a.disconnectedAt).length;
  }

  const sortedProfiles = [...profiles].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const activeCount = activeProfile ? getAccountCount(activeProfile.id) : 0;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between gap-2 h-9 px-3 font-normal text-sm bg-muted/20 hover:bg-muted/40 border-border/50"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-6 w-6 shrink-0 rounded-md bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">
                {activeProfile ? ProfileInitials(activeProfile.name) : "?"}
              </div>
              <div className="text-left min-w-0">
                <p className="text-sm font-medium truncate">
                  {activeProfile?.name ?? "Select profile"}
                </p>
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-full min-w-64">
          <div className="px-2 py-1.5 border-b border-border/50">
            <p className="text-xs font-medium text-foreground">Profiles</p>
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1">
            {sortedProfiles.map((profile) => {
              const isSelected = activeProfile?.id === profile.id;
              const count = getAccountCount(profile.id);
              return (
                <div
                  key={profile.id}
                  className={`flex items-center gap-2 rounded-sm mx-1 px-2 py-1.5 hover:bg-accent/50 group cursor-pointer transition-colors ${
                    isSelected ? "bg-accent/60" : ""
                  }`}
                  onClick={() => {
                    if (editingId !== profile.id) {
                      setActiveProfileId(profile.id);
                      setOpen(false);
                    }
                  }}
                >
                  {editingId === profile.id ? (
                    <div className="flex gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRename();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-7 text-xs flex-1"
                        autoFocus
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={handleSaveRename}
                        aria-label="Save name"
                      >
                        <Check className="h-3 w-3" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="h-6 w-6 shrink-0 rounded-md bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">
                        {profile.kind === "personal" ? (
                          <User className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          ProfileInitials(profile.name)
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{profile.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {profile.kind === "personal" ? "Personal · " : ""}
                          {count} accounts
                        </p>
                      </div>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      <div
                        className="flex gap-0.5 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0"
                          onClick={() => {
                            setEditingId(profile.id);
                            setEditName(profile.name);
                          }}
                          aria-label={`Rename ${profile.name}`}
                        >
                          <Pencil className="h-3 w-3" aria-hidden />
                        </Button>
                        {profiles.length > 1 && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget({ id: profile.id, name: profile.name })}
                            aria-label={`Delete ${profile.name}`}
                          >
                            <Trash2 className="h-3 w-3" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <div className="flex gap-1">
              <Input
                placeholder="Profile name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddProfile()}
                className="h-8 text-sm"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={handleAddProfile}
                aria-label="Add profile"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete profile?</AlertDialogTitle>
            <AlertDialogDescription>
              The profile &quot;{deleteTarget?.name}&quot; and its{" "}
              {deleteTarget ? getAccountCount(deleteTarget.id) : 0} connected accounts will be permanently deleted.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  removeProfile(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
