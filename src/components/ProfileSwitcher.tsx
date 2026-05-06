import { useState } from "react";
import { Building2, Check, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
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
    const name = newName.trim() || "Nytt profil";
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
            className="w-full justify-between gap-2 h-11 px-3 font-normal text-sm bg-card hover:bg-accent/50 border-border/70"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-7 w-7 shrink-0 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                {activeProfile ? ProfileInitials(activeProfile.name) : "?"}
              </div>
              <div className="text-left min-w-0">
                <p className="text-sm font-medium truncate text-foreground">
                  {activeProfile?.name ?? "Välj profil"}
                </p>
                {activeProfile && (
                  <p className="text-[11px] text-muted-foreground">
                    {activeCount} kopplade konton
                  </p>
                )}
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Företagsprofiler — alla verktyg använder den aktiva
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="max-h-[260px] overflow-y-auto py-1">
            {sortedProfiles.map((profile) => {
              const isSelected = activeProfile?.id === profile.id;
              const count = getAccountCount(profile.id);
              return (
                <div
                  key={profile.id}
                  className={`flex items-center gap-2 rounded-md mx-1 px-2 py-2 hover:bg-accent group cursor-pointer ${
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
                        aria-label="Spara namn"
                      >
                        <Check className="h-3 w-3" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="h-7 w-7 shrink-0 rounded-md bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {ProfileInitials(profile.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{profile.name}</p>
                        <p className="text-[11px] text-muted-foreground">{count} konton</p>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      <div
                        className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 ml-auto"
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
                          aria-label={`Byt namn på ${profile.name}`}
                        >
                          <Pencil className="h-3 w-3" aria-hidden />
                        </Button>
                        {profiles.length > 1 && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget({ id: profile.id, name: profile.name })}
                            aria-label={`Ta bort ${profile.name}`}
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
          <div className="px-2 py-2">
            <p className="text-[11px] text-muted-foreground mb-1.5">Nytt företagsprofil</p>
            <div className="flex gap-1">
              <Input
                placeholder="Namn på profilen…"
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
                aria-label="Lägg till företagsprofil"
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
            <AlertDialogTitle>Ta bort profil?</AlertDialogTitle>
            <AlertDialogDescription>
              Profilen &quot;{deleteTarget?.name}&quot; och dess{" "}
              {deleteTarget ? getAccountCount(deleteTarget.id) : 0} kopplade konton tas bort permanent.
              Det går inte att ångra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  removeProfile(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
