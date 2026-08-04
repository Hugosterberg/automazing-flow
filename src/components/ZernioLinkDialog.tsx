import { Layers, Loader2 } from "lucide-react";
import type { JSX } from "react";
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
  onConnectNew?: (platform: SocialPlatform) => void;
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
  onConnectNew,
  platformIcons,
}: Props) {
  const filtered = zernioFilter
    ? zernioAccounts.filter((a) => a.mappedPlatform === zernioFilter)
    : zernioAccounts;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Link existing Zernio account
          </DialogTitle>
          <DialogDescription>
            {zernioFilter
              ? `Advanced fallback: this only shows ${zernioFilter.replace(/_/g, " ")} channels that Zernio already exposes. Normal Connect starts a new provider login through Automazing.`
              : "Advanced fallback: choose a channel already connected in Zernio if you do not want to run a new provider login."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {zernioFilter && onConnectNew ? (
            <div className="rounded-lg border border-border bg-muted/25 p-3 space-y-2">
              <p className="text-sm font-medium">Saknas kontot i listan?</p>
              <p className="text-xs text-muted-foreground">
                Då ska du köra vanlig Connect. Den öppnar Zernios OAuth-flöde från Automazing och skapar
                kopplingen utan att du behöver gå till Zernio-dashboarden.
              </p>
              <Button type="button" size="sm" onClick={() => onConnectNew(zernioFilter)}>
                Start Connect for {zernioFilter.replace(/_/g, " ")}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Click <span className="font-medium">Link</span> only when the account already exists in Zernio.
            </p>
          )}
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
                <div className="rounded-md border border-border/70 bg-background p-3 text-sm text-muted-foreground space-y-2">
                  <p>No accounts here yet.</p>
                  <p>
                    If you just connected a new channel, click <span className="font-medium text-foreground">Refresh list</span>.
                    If it still does not appear, Zernio did not expose that channel for this workspace/profile.
                  </p>
                </div>
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
