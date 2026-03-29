import { Layers, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AccountPlatform, SocialPlatform } from "@/types/accounts";
import type { ZernioAccountRow } from "@/hooks/useZernioAccounts";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zernioFilter: SocialPlatform | null;
  zernioAccounts: ZernioAccountRow[];
  zernioLoading: boolean;
  zernioLinking: string | null;
  zernioError: string | null;
  onRefresh: () => Promise<void> | void;
  onLink: (row: ZernioAccountRow) => Promise<void> | void;
  platformIcons: Record<AccountPlatform, (props: { className?: string }) => JSX.Element>;
};

export function ZernioLinkDialog({
  open,
  onOpenChange,
  zernioFilter,
  zernioAccounts,
  zernioLoading,
  zernioLinking,
  zernioError,
  onRefresh,
  onLink,
  platformIcons,
}: Props) {
  const filtered = zernioFilter
    ? zernioAccounts.filter((a) => a.mappedPlatform === zernioFilter)
    : zernioAccounts;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Link Zernio account
          </DialogTitle>
          <DialogDescription>
            {zernioFilter
              ? `Showing only ${zernioFilter.replace(/_/g, " ")}. Connect the channel in the Zernio dashboard first.`
              : "Choose a channel already connected in Zernio (Facebook, TikTok, Google Business, WhatsApp, etc.)."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            Click <span className="font-medium">Link</span> on the account you want to add.
          </p>
          {zernioLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Loading accounts...
            </div>
          )}
          {zernioError && (
            <p className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2">
              {zernioError}
            </p>
          )}
          {!zernioLoading && (
            <>
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No accounts here yet. Connect the channel in{" "}
                  <a
                    href="https://zernio.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    Zernio
                  </a>
                  , set <code className="text-xs bg-muted px-1 rounded">ZERNIO_API_KEY</code> in the server{" "}
                  <code className="text-xs bg-muted px-1 rounded">.env</code>, see{" "}
                  <code className="text-xs bg-muted px-1 rounded">docs/KOPPLINGAR.md</code>.
                </p>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((row) => {
                    const zid = String(row.id || row.accountId || (row as Record<string, unknown>)._id || "");
                    const mp = row.mappedPlatform;
                    const ZIcon = mp ? platformIcons[mp as AccountPlatform] : Layers;
                    const title = row.displayName || row.name || row.username || zid || "Account";
                    const idHint = zid.length > 14 ? `${zid.slice(0, 12)}...` : zid || "";

                    return (
                      <li key={zid || title}>
                        <div className="w-full rounded-md border border-border bg-card px-3 py-2.5 flex items-center gap-2">
                          <ZIcon className="h-4 w-4 shrink-0" />
                          <span className="flex flex-col items-start min-w-0 text-left flex-1">
                            <span className="truncate font-medium text-sm">{title}</span>
                            <span className="text-[11px] text-muted-foreground truncate">
                              {mp?.replace(/_/g, " ") ?? row.rawPlatform ?? "channel"}
                              {idHint ? ` · ${idHint}` : ""}
                            </span>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={zernioLinking === zid}
                            onClick={() => void onLink(row)}
                          >
                            {zernioLinking === zid ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                                Linking...
                              </>
                            ) : (
                              "Link"
                            )}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="secondary" type="button" disabled={zernioLoading} onClick={() => void onRefresh()}>
            Refresh list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
