import { useState } from "react";
import { Building2, Plus, Pencil, Trash2, Check, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 h-9 px-2 font-normal text-sm"
          >
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate flex items-center gap-1.5 text-left">
              {activeProfile?.name ?? "Select profile"}
              {activeProfile ? (
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                  ({getAccountCount(activeProfile.id)})
                </span>
              ) : null}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            All sidebar tools use this profile
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {sortedProfiles.map((profile) => {
            const isSelected = activeProfile?.id === profile.id;
            return (
              <div
                key={profile.id}
                className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 hover:bg-accent group"
              >
                {editingId === profile.id ? (
                  <div className="flex gap-1 flex-1 min-w-0">
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
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSaveRename}>
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    {isSelected ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <span className="w-4 shrink-0" aria-hidden />
                    )}
                    <button
                      type="button"
                      className="flex-1 text-left text-sm truncate min-w-0"
                      onClick={() => setActiveProfileId(profile.id)}
                    >
                      {profile.name}
                    </button>
                    <span
                      className="text-xs text-muted-foreground shrink-0 tabular-nums"
                      title="Connected channels"
                    >
                      {getAccountCount(profile.id)}
                    </span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(profile.id);
                          setEditName(profile.name);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      {profiles.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({ id: profile.id, name: profile.name });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <div className="flex gap-1">
              <Input
                placeholder="New profile..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddProfile()}
                className="h-8 text-sm"
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleAddProfile}>
                <Plus className="h-4 w-4" />
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
              {deleteTarget ? getAccountCount(deleteTarget.id) : 0} connected channel
              {deleteTarget && getAccountCount(deleteTarget.id) === 1 ? "" : "s"} will be removed from
              this workspace. This cannot be undone.
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
