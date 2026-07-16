import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Film,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assetSelectionKey } from "@/lib/contentSelection";
import { formatShortDate } from "@/lib/format";
import { ContentUploadDropzone } from "@/features/content/ContentUploadDropzone";
import {
  MediaSection,
  type DriveBrowserItem,
  type DriveProviderData,
} from "@/features/content/DriveMediaGrid";

const PREVIEW_COUNT = 4;

export type DriveBrowseAccount = {
  id: string;
  username: string;
};

export type DriveBrowsePanelProps = {
  error: string | null;
  onRetry: () => void;
  activeAccountId: string | null;
  driveView: "my-drive" | "shared-with-me";
  onDriveViewChange: (view: "my-drive" | "shared-with-me") => void;
  folderStack: { id: string; name: string }[];
  onNavigateBack: () => void;
  onNavigateRoot: () => void;
  onNavigateToBreadcrumb: (index: number) => void;
  onNavigateIntoFolder: (folder: { id: string; name: string }) => void;
  driveAccounts: DriveBrowseAccount[];
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
  selectedCount: number;
  onGoSelected: () => void;
  loading: boolean;
  driveSearch: string;
  onDriveSearchChange: (value: string) => void;
  driveSearchRef: React.RefObject<HTMLInputElement | null>;
  onUploadFiles: (files: FileList | null) => void | Promise<void>;
  uploading: boolean;
  uploadDisabled: boolean;
  folderItems: DriveBrowserItem[];
  imageItems: DriveBrowserItem[];
  videoItems: DriveBrowserItem[];
  otherItems: DriveBrowserItem[];
  browseMediaFiles: DriveBrowserItem[];
  filteredActiveItems: DriveBrowserItem[];
  driveQuery: string;
  providerData: DriveProviderData;
  selectedIds: Set<string>;
  onToggleAsset: (file: DriveBrowserItem, checked: boolean) => void;
  focusedFileId: string | null;
  focusedFile: DriveBrowserItem | null;
};

export function DriveBrowsePanel({
  error,
  onRetry,
  activeAccountId,
  driveView,
  onDriveViewChange,
  folderStack,
  onNavigateBack,
  onNavigateRoot,
  onNavigateToBreadcrumb,
  onNavigateIntoFolder,
  driveAccounts,
  selectedAccountId,
  onSelectAccount,
  selectedCount,
  onGoSelected,
  loading,
  driveSearch,
  onDriveSearchChange,
  driveSearchRef,
  onUploadFiles,
  uploading,
  uploadDisabled,
  folderItems,
  imageItems,
  videoItems,
  otherItems,
  browseMediaFiles,
  filteredActiveItems,
  driveQuery,
  providerData,
  selectedIds,
  onToggleAsset,
  focusedFileId,
  focusedFile,
}: DriveBrowsePanelProps) {
  const [imagesExpanded, setImagesExpanded] = useState(false);
  const [videosExpanded, setVideosExpanded] = useState(false);
  const browseUploadRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {error ? (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {activeAccountId ? (
        <div className="space-y-3">
          <Tabs
            value={driveView}
            onValueChange={(value) => {
              onDriveViewChange(value === "shared-with-me" ? "shared-with-me" : "my-drive");
            }}
          >
            <TabsList className="h-auto rounded-none border-b border-border bg-transparent p-0">
              <TabsTrigger
                value="my-drive"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2"
              >
                <HardDrive className="h-3.5 w-3.5" />
                Min enhet
              </TabsTrigger>
              <TabsTrigger
                value="shared-with-me"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2"
              >
                <Users className="h-3.5 w-3.5" />
                Delat med mig
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {folderStack.length > 0 && (
            <div className="flex items-center gap-1.5 text-sm min-w-0">
              <button
                onClick={onNavigateBack}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onNavigateRoot}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                {driveView === "shared-with-me" ? "Delat med mig" : "Min enhet"}
              </button>
              {folderStack.map((f, i) => (
                <React.Fragment key={f.id}>
                  <span className="text-muted-foreground/50">/</span>
                  {i === folderStack.length - 1 ? (
                    <span className="font-medium truncate">{f.name}</span>
                  ) : (
                    <button
                      onClick={() => onNavigateToBreadcrumb(i)}
                      className="text-muted-foreground hover:text-foreground transition-colors truncate"
                    >
                      {f.name}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {driveAccounts.length > 1 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Kopplade Drive-konton</CardTitle>
            <CardDescription>Välj vilket Google Drive-konto du vill bläddra i just nu.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {driveAccounts.map((account) => (
              <Button
                key={account.id}
                variant={selectedAccountId === account.id ? "default" : "outline"}
                onClick={() => onSelectAccount(account.id)}
              >
                {account.username}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Google Drive</CardTitle>
          <CardDescription>
            Klicka på bilder eller videor för att lägga till i Valda
            {selectedCount > 0 ? (
              <>
                {" "}
                ·{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={onGoSelected}
                >
                  {selectedCount} valda
                </button>
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
      </Card>

      {driveAccounts.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="Ingen Google Drive kopplad ännu"
          description="Koppla Drive under Kopplingar — sedan kan du bläddra mappar, markera media och schemalägga publicering."
          action={
            <Button asChild>
              <Link to="/connections?q=drive">Öppna Kopplingar</Link>
            </Button>
          }
        />
      ) : loading ? (
        <Card className="bg-card border-border">
          <CardContent className="py-10 flex items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laddar…
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={driveSearchRef}
                id="driveSearch"
                type="search"
                placeholder="Sök filer efter namn…"
                value={driveSearch}
                onChange={(e) => onDriveSearchChange(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <input
              ref={browseUploadRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = event.target.files;
                void Promise.resolve(onUploadFiles(files)).finally(() => {
                  if (browseUploadRef.current) browseUploadRef.current.value = "";
                });
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || uploadDisabled}
              onClick={() => browseUploadRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Upload files
            </Button>
          </div>
          <ContentUploadDropzone
            onFiles={onUploadFiles}
            busy={uploading}
            disabled={uploadDisabled}
            className="py-6"
            label="Eller släpp filer här för att ladda upp till Valda"
          />
          {folderItems.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {folderItems.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => onNavigateIntoFolder({ id: folder.id, name: folder.name })}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-center group"
                  >
                    <div className="h-12 w-12 rounded-lg bg-secondary/60 flex items-center justify-center group-hover:bg-secondary transition-colors">
                      <FolderOpen className="h-6 w-6 text-blue-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{folder.name}</p>
                      {folder.modifiedTime && (
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                          {formatShortDate(folder.modifiedTime)}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(imageItems.length > 0 || videoItems.length > 0) && (
            <>
              {imageItems.length > 0 && (
                <MediaSection
                  title="Images"
                  icon={<ImageIcon className="h-4 w-4" />}
                  files={imageItems}
                  expanded={imagesExpanded}
                  onToggleExpand={() => setImagesExpanded((v) => !v)}
                  previewCount={PREVIEW_COUNT}
                  selectedIds={selectedIds}
                  selectionKeyForFile={(file) =>
                    assetSelectionKey({ id: file.id, sourceAccountId: activeAccountId ?? "" })
                  }
                  onToggleAsset={onToggleAsset}
                  focusedFileId={focusedFileId}
                />
              )}
              {videoItems.length > 0 && (
                <MediaSection
                  title="Videos"
                  icon={<Film className="h-4 w-4" />}
                  files={videoItems}
                  expanded={videosExpanded}
                  onToggleExpand={() => setVideosExpanded((v) => !v)}
                  previewCount={PREVIEW_COUNT}
                  selectedIds={selectedIds}
                  selectionKeyForFile={(file) =>
                    assetSelectionKey({ id: file.id, sourceAccountId: activeAccountId ?? "" })
                  }
                  onToggleAsset={onToggleAsset}
                  focusedFileId={focusedFileId}
                />
              )}
            </>
          )}

          {browseMediaFiles.length > 0 ? (
            <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm sm:px-4 rounded-b-lg -mx-0">
              <span className="truncate">
                {focusedFile ? (
                  <>
                    Fokus:{" "}
                    <span className="font-medium text-foreground/80">{focusedFile.name}</span>
                  </>
                ) : (
                  "J/K bläddra bland bilder och videor"
                )}
              </span>
              <span className="hidden sm:inline">S Select · / Search</span>
            </div>
          ) : null}

          {otherItems.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Other files</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {otherItems.map((file) => (
                  <div
                    key={`${file.id}-${file.name}`}
                    className="flex items-center gap-3 p-2 rounded-lg border border-border/50 hover:bg-accent/30 transition-colors"
                  >
                    <div className="h-8 w-8 rounded-md bg-secondary/40 flex items-center justify-center shrink-0 overflow-hidden">
                      {file.iconLink ? (
                        <img src={file.iconLink} alt="" className="h-4 w-4 object-contain" />
                      ) : (
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{file.name}</p>
                      <p className="text-[11px] text-muted-foreground/70">{file.mimeType}</p>
                    </div>
                    {file.webViewLink && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs shrink-0" asChild>
                        <a href={file.webViewLink} target="_blank" rel="noopener noreferrer">
                          Open
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredActiveItems.length === 0 && !loading && (
            <Card className="bg-card border-border border-dashed">
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {driveQuery
                    ? `Inga filer matchar "${driveSearch.trim()}".`
                    : driveView === "shared-with-me"
                      ? "Inga filer delade med dig."
                      : providerData?.currentFolderName
                        ? `Inga filer i "${providerData.currentFolderName}".`
                        : "Inga filer i Min enhet. Prova att bläddra i en undermapp — eller byt till Delat med mig."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
