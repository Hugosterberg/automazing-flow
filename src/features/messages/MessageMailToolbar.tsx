import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  Folder,
  FolderPlus,
  Inbox,
  Loader2,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createMailFolder, fetchMailFolders } from "./mailFoldersClient";
import type { MailFolder, MailFolderSelection, MailSortOrder, MailViewFilter } from "./types";

type MailAccount = {
  id: string;
  label: string;
  platform: "gmail" | "outlook";
};

const VIEW_FILTERS: Array<{ value: MailViewFilter; label: string; icon?: typeof Star }> = [
  { value: "all", label: "Alla" },
  { value: "unread", label: "Olästa" },
  { value: "starred", label: "Flaggade", icon: Star },
];

const SORT_OPTIONS: Array<{ value: MailSortOrder; label: string; hint: string }> = [
  { value: "triage", label: "Triage", hint: "Öppna först, äldst väntar" },
  { value: "newest", label: "Nyast", hint: "Senaste mail överst" },
  { value: "oldest", label: "Äldst", hint: "Äldsta mail överst" },
];

type Props = {
  mailAccounts: MailAccount[];
  selectedFolder: MailFolderSelection | null;
  onSelectFolder: (folder: MailFolderSelection | null) => void;
  mailViewFilter: MailViewFilter;
  onMailViewFilterChange: (filter: MailViewFilter) => void;
  mailSort: MailSortOrder;
  onMailSortChange: (sort: MailSortOrder) => void;
  businessProfileId?: string | null;
  disabled?: boolean;
  onFoldersChange?: (folders: MailFolder[]) => void;
};

export function MessageMailToolbar({
  mailAccounts,
  selectedFolder,
  onSelectFolder,
  mailViewFilter,
  onMailViewFilterChange,
  mailSort,
  onMailSortChange,
  businessProfileId,
  disabled,
  onFoldersChange,
}: Props) {
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createAccountId, setCreateAccountId] = useState("");
  const [creating, setCreating] = useState(false);

  const loadFolders = useCallback(async () => {
    if (mailAccounts.length === 0) {
      setFolders([]);
      return;
    }
    setLoading(true);
    try {
      const lists = await Promise.all(
        mailAccounts.map(async (account) => {
          try {
            const rows = await fetchMailFolders(account.id, businessProfileId);
            return rows.map((folder) => ({
              ...folder,
              name: mailAccounts.length > 1 ? `${folder.name} · ${account.label}` : folder.name,
            }));
          } catch {
            return [];
          }
        })
      );
      const flat = lists.flat();
      setFolders(flat);
      onFoldersChange?.(flat);
    } finally {
      setLoading(false);
    }
  }, [businessProfileId, mailAccounts, onFoldersChange]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  const defaultCreateAccountId = useMemo(
    () => selectedFolder?.accountId || mailAccounts[0]?.id || "",
    [mailAccounts, selectedFolder?.accountId]
  );

  useEffect(() => {
    if (!createOpen) return;
    setCreateAccountId(defaultCreateAccountId);
  }, [createOpen, defaultCreateAccountId]);

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    const accountId = createAccountId || defaultCreateAccountId;
    if (!name || !accountId) return;
    setCreating(true);
    try {
      const folder = await createMailFolder({ accountId, name, businessProfileId });
      toast.success(`Mappen «${folder.name}» skapades.`);
      setCreateOpen(false);
      setNewFolderName("");
      await loadFolders();
      onSelectFolder({ accountId: folder.accountId, folderId: folder.id, folderName: folder.name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunde inte skapa mappen.");
    } finally {
      setCreating(false);
    }
  }

  if (mailAccounts.length === 0) return null;

  const inboxActive = !selectedFolder;
  const sortLabel = SORT_OPTIONS.find((opt) => opt.value === mailSort)?.label || "Sortera";

  return (
    <>
      <div className="flex max-w-full min-w-0 shrink-0 flex-wrap items-center gap-1.5 overflow-x-hidden border-b border-border/60 bg-muted/10 px-3 py-1.5 lg:gap-2 lg:px-3 lg:py-1">
        <div className="flex min-w-0 max-w-full flex-1 flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectFolder(null)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all",
              inboxActive
                ? "border-primary/40 bg-primary text-primary-foreground shadow-sm"
                : "border-border/60 bg-background/70 text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            <Inbox className="h-3 w-3" />
            Inkorg
          </button>
          {loading ? (
            <span className="inline-flex items-center gap-1 px-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
            </span>
          ) : (
            folders.map((folder) => {
              const active =
                selectedFolder?.folderId === folder.id && selectedFolder.accountId === folder.accountId;
              return (
                <button
                  key={`${folder.accountId}:${folder.id}`}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onSelectFolder({
                      accountId: folder.accountId,
                      folderId: folder.id,
                      folderName: folder.name,
                    })
                  }
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all",
                    active
                      ? "border-primary/40 bg-primary text-primary-foreground shadow-sm"
                      : "border-border/60 bg-background/70 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                  title={folder.messageCount != null ? `${folder.messageCount} meddelanden` : undefined}
                >
                  <Folder className="h-3 w-3" />
                  <span className="max-w-[120px] truncate">{folder.name}</span>
                  {folder.unreadCount ? (
                    <span
                      className={cn(
                        "rounded-full px-1 text-[10px] tabular-nums",
                        active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary"
                      )}
                    >
                      {folder.unreadCount}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 gap-1 rounded-full px-1.5 text-[11px] text-muted-foreground"
            disabled={disabled || loading}
            onClick={() => setCreateOpen(true)}
            title="Skapa mapp"
          >
            <FolderPlus className="h-3 w-3" />
            <span className="hidden sm:inline">Ny</span>
          </Button>
        </div>

        <div
          className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/50 bg-background/60 p-0.5"
          role="group"
          aria-label="Filtrera mail"
        >
          {VIEW_FILTERS.map((opt) => {
            const Icon = opt.icon;
            const active = mailViewFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => onMailViewFilterChange(opt.value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary ring-1 ring-primary/25"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
                title={opt.label}
              >
                {Icon ? <Icon className={cn("h-3 w-3", active && "fill-current")} /> : null}
                <span className="hidden md:inline">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <Select value={mailSort} onValueChange={(v) => onMailSortChange(v as MailSortOrder)} disabled={disabled}>
          <SelectTrigger className="h-6 w-auto min-w-[5.5rem] gap-1 border-border/60 bg-background/70 px-2 text-[11px]">
            <ArrowUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            <SelectValue placeholder={sortLabel} />
          </SelectTrigger>
          <SelectContent align="end">
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                <span className="font-medium">{opt.label}</span>
                <span className="ml-1 text-muted-foreground">· {opt.hint}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Skapa mailmapp</DialogTitle>
            <DialogDescription>
              Mappen skapas i Gmail (etikett) eller Outlook (under Inkorg) och kan användas för att sortera mail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {mailAccounts.length > 1 ? (
              <div className="space-y-1.5">
                <Label htmlFor="mail-folder-account">Konto</Label>
                <select
                  id="mail-folder-account"
                  value={createAccountId}
                  onChange={(e) => setCreateAccountId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {mailAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label} ({account.platform === "gmail" ? "Gmail" : "Outlook"})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="mail-folder-name">Mappnamn</Label>
              <Input
                id="mail-folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="t.ex. Fakturor, Leads, Support…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateFolder();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Avbryt
            </Button>
            <Button type="button" onClick={() => void handleCreateFolder()} disabled={creating || !newFolderName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Skapa mapp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
