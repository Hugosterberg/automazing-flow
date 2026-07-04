import { useState } from "react";
import { Download, FolderPlus, History, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  generatedItemToAsset,
  isLikelyExpiredMedia,
  resolveDownloadUrl,
  resolveThumbnailUrl,
  type GeneratedContentItem,
} from "./generatedContentHistory";

function sourceLabel(source: GeneratedContentItem["source"]) {
  if (source === "apiai") return "apiai.me";
  if (source === "openai") return "OpenAI";
  if (source === "canva") return "Canva";
  return source;
}

export function GeneratedHistoryPanel({
  items,
  loading,
  onAddToSelection,
  onRemove,
  onClear,
}: {
  items: GeneratedContentItem[];
  loading?: boolean;
  onAddToSelection: (asset: ReturnType<typeof generatedItemToAsset>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (loading) {
    return (
      <Card className="border-border border-dashed">
        <CardContent className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading history…
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="border-border border-dashed">
        <CardContent className="py-10 text-center space-y-2">
          <History className="h-8 w-8 mx-auto text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            Generated images and videos appear here automatically — download or add them to your selection anytime.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {items.length} saved generation{items.length === 1 ? "" : "s"} · stored for 30 days on the server
        </p>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              Clear history
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear generation history?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the list from your profile. Server files may remain until they expire.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onClear();
                  setConfirmOpen(false);
                }}
              >
                Clear
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((item) => {
          const expired = isLikelyExpiredMedia(item);
          const downloadUrl = resolveDownloadUrl(item);
          const thumbnailUrl = resolveThumbnailUrl(item);
          return (
            <Card key={item.id} className="overflow-hidden border-border">
              <div className="aspect-square bg-muted/30 relative">
                {item.kind === "image" ? (
                  <img
                    src={thumbnailUrl}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
                <Badge variant="secondary" className="absolute top-2 left-2 text-[10px]">
                  {sourceLabel(item.source)}
                </Badge>
              </div>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs truncate">{item.name}</CardTitle>
                <CardDescription className="text-[10px]">
                  {new Date(item.createdAt).toLocaleString()}
                  {item.toolName ? ` · ${item.toolName}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {expired ? (
                  <p className="text-[10px] text-amber-700 dark:text-amber-300">
                    Link may have expired — re-generate if download fails.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onAddToSelection(generatedItemToAsset(item))}
                  >
                    <FolderPlus className="h-3 w-3 mr-1" />
                    Select
                  </Button>
                  <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                    <a href={downloadUrl} download={item.name} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3 w-3 mr-1" />
                      Save
                    </a>
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(item.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                    <span className="sr-only">Remove</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
