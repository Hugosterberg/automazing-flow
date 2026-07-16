import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  Folder,
  FolderPlus,
  Inbox,
  Layers,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createMailFolder, fetchMailFolders } from "./mailFoldersClient";
import {
  isMailSortOrder,
  type MailFolder,
  type MailFolderSelection,
  type MailSortOrder,
  type MailViewFilter,
} from "./types";

type MailAccount = {
  id: string;
  label: string;
  platform: "gmail" | "outlook";
};

const VIEW_FILTERS: Array<{ value: MailViewFilter; label: string; short: string; icon?: typeof Star }> = [
  { value: "all", label: "Alla", short: "Alla" },
  { value: "unread", label: "Olästa", short: "Ol." },
  { value: "starred", label: "Flaggade", short: "★", icon: Star },
];

const SORT_OPTIONS: Array<{ value: MailSortOrder; label: string; hint: string }> = [
  { value: "triage", label: "Triage", hint: "Öppna först" },
  { value: "newest", label: "Nyast", hint: "Senaste överst" },
  { value: "oldest", label: "Äldst", hint: "Äldsta överst" },
];

const INBOX_VALUE = "__inbox__";

type Props = {
  mailAccounts: MailAccount[];
  selectedFolder: MailFolderSelection | null;
  onSelectFolder: (folder: MailFolderSelection | null) => void;
  includeAllMail: boolean;
  onIncludeAllMailChange: (value: boolean) => void;
  mailViewFilter: MailViewFilter;
  onMailViewFilterChange: (filter: MailViewFilter) => void;
  mailSort: MailSortOrder;
  onMailSortChange: (sort: MailSortOrder) => void;
  businessProfileId?: string | null;
  disabled?: boolean;
  onFoldersChange?: (folders: MailFolder[]) => void;
};

function folderValue(folder: Pick<MailFolder, "accountId" | "id">) {
  return `${folder.accountId}:${folder.id}`;
}

export function MessageMailToolbar({
  mailAccounts,
  selectedFolder,
  onSelectFolder,
  includeAllMail,
  onIncludeAllMailChange,
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

  const folderSelectValue = selectedFolder
    ? folderValue({ accountId: selectedFolder.accountId, id: selectedFolder.folderId })
    : INBOX_VALUE;

  const activeFolderLabel = selectedFolder?.folderName || (includeAllMail ? "Alla mail" : "Inkorg");
  const activeUnread =
    selectedFolder == null
      ? null
      : folders.find(
          (f) => f.id === selectedFolder.folderId && f.accountId === selectedFolder.accountId
        )?.unreadCount;

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

  function handleFolderChange(value: string) {
    if (value === INBOX_VALUE) {
      onSelectFolder(null);
      return;
    }
    const folder = folders.find((f) => folderValue(f) === value);
    if (!folder) return;
    onSelectFolder({
      accountId: folder.accountId,
      folderId: folder.id,
      folderName: folder.name,
    });
  }

  if (mailAccounts.length === 0) return null;

  return (
    <>
      <div className="flex h-8 max-w-full min-w-0 shrink-0 items-center gap-1.5 border-b border-border/50 bg-muted/5 px-2 sm:px-3">
        {/* Minimalist folder dropdown — single control for all mail folders */}
        <Select value={folderSelectValue} onValueChange={handleFolderChange} disabled={disabled || loading}>
          <SelectTrigger
            className="h-7 w-auto max-w-[min(52vw,16rem)] gap-1 rounded-md border border-border/60 bg-background/80 px-2 text-[11px] font-medium shadow-none focus:ring-1 focus:ring-primary/25"
            aria-label="Välj mapp"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
            ) : selectedFolder ? (
              <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : includeAllMail ? (
              <Layers className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <Inbox className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <SelectValue>
              <span className="truncate">{activeFolderLabel}</span>
            </SelectValue>
            {activeUnread ? (
              <span className="rounded-full bg-primary/12 px-1 text-[10px] tabular-nums text-primary">
                {activeUnread}
              </span>
            ) : null}
          </SelectTrigger>
          <SelectContent align="start" className="max-h-72 min-w-[13rem]">
            <SelectItem value={INBOX_VALUE} className="text-xs">
              <span className="inline-flex items-center gap-1.5">
                {includeAllMail ? (
                  <Layers className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <Inbox className="h-3 w-3 text-muted-foreground" />
                )}
                {includeAllMail ? "Alla mail" : "Inkorg"}
              </span>
            </SelectItem>
            {folders.map((folder) => (
              <SelectItem key={folderValue(folder)} value={folderValue(folder)} className="text-xs">
                <span className="inline-flex w-full items-center justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{folder.name}</span>
                  </span>
                  {folder.unreadCount ? (
                    <span className="tabular-nums text-muted-foreground">{folder.unreadCount}</span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 shrink-0 p-0 text-muted-foreground"
              disabled={disabled || loading}
              onClick={() => setCreateOpen(true)}
              aria-label="Skapa mapp"
            >
              <FolderPlus className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Ny mapp</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={disabled || Boolean(selectedFolder)}
              onClick={() => onIncludeAllMailChange(!includeAllMail)}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-colors",
                includeAllMail && !selectedFolder
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                selectedFolder && "opacity-50"
              )}
              aria-pressed={includeAllMail && !selectedFolder}
              aria-label="Visa alla mail oavsett mapp"
            >
              <Layers className="h-3 w-3 shrink-0" />
              <span className="hidden sm:inline">Alla mappar</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {selectedFolder
              ? "Gäller när Inkorg/Alla mail är valt — byt från mappen först"
              : includeAllMail
                ? "Visar senaste mail från alla mappar/etiketter"
                : "Visa alla mail, även de som ligger i mappar"}
          </TooltipContent>
        </Tooltip>

        <div className="mx-0.5 h-3.5 w-px shrink-0 bg-border/70" aria-hidden />

        <div
          className="flex shrink-0 items-center gap-px"
          role="group"
          aria-label="Filtrera mail"
        >
          {VIEW_FILTERS.map((opt) => {
            const Icon = opt.icon;
            const active = mailViewFilter === opt.value;
            return (
              <Tooltip key={opt.value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onMailViewFilterChange(opt.value)}
                    className={cn(
                      "inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[10px] font-medium transition-colors",
                      active
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                    aria-pressed={active}
                    aria-label={opt.label}
                  >
                    {Icon ? <Icon className={cn("h-3 w-3", active && "fill-current")} /> : opt.short}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{opt.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="ml-auto flex shrink-0 items-center">
          <Select
            value={mailSort}
            onValueChange={(v) => {
              if (isMailSortOrder(v)) onMailSortChange(v);
            }}
            disabled={disabled}
          >
            <SelectTrigger
              className="h-6 w-auto gap-1 border-0 bg-transparent px-1.5 text-[11px] shadow-none focus:ring-0 focus:ring-offset-0"
              aria-label="Sortera"
            >
              <ArrowUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="hidden sm:inline">
                {SORT_OPTIONS.find((opt) => opt.value === mailSort)?.label || "Sortera"}
              </span>
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
