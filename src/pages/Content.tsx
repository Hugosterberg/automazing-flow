import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useIsMobile } from "@/hooks/use-mobile";
import { assetSelectionKey, type SelectedContentAsset } from "@/lib/contentSelection";
import { fetchProducts } from "@/lib/productsApi";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageAiSuggestionsStrip } from "@/features/ai-recommendations/PageAiSuggestionsStrip";
import { AutomationEnableHint } from "@/features/automation";
import { PublishComposer } from "@/features/content/PublishComposer";
import { CreateTab } from "@/features/content/CreateTab";
import { ContentNextStepBar } from "@/features/content/ContentNextStepBar";
import { isContentTab, type ContentTab } from "@/features/content/contentFlow";
import { SelectedContentPanel } from "@/features/content/SelectedContentPanel";
import { ContentIdeasHub } from "@/features/content/ContentIdeasHub";
import { GeneratedHistoryPanel } from "@/features/content/GeneratedHistoryPanel";
import { useGeneratedContentHistory } from "@/features/content/useGeneratedContentHistory";
import { PublishSafetyPanel } from "@/features/content/PublishSafetyPanel";
import { publishBlockReason, type PublishReadiness } from "@/features/content/apiaiResultInsights";
import { DriveBrowsePanel } from "@/features/content/DriveBrowsePanel";
import { useDriveBrowser } from "@/features/content/useDriveBrowser";
import { useContentAssetSelection } from "@/features/content/useContentAssetSelection";
import { apiUrl } from "@/lib/apiBase";
import { consumeContentCaption } from "@/lib/contentCaptionHandoff";
import { FolderOpen, History, Loader2, RefreshCw, HardDrive, ChevronDown, Wand2, Send, BookmarkCheck, MoreHorizontal } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useActiveBusinessProfileIdOptional, useBusinessProfiles } from "@/features/business-profiles";
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";
import { cn } from "@/lib/utils";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";

export default function ContentPage() {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const { authMode, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { activeProfileId, accounts, addAccountFromOAuth, getSelectedAccountId, setSelectedAccountId } = useAccounts();
  const activeBusinessProfileId = useActiveBusinessProfileIdOptional();
  const { profiles } = useBusinessProfiles();
  const activeProfile = profiles.find((profile) => profile.id === (activeBusinessProfileId ?? activeProfileId));
  const createBusinessProfileId = activeBusinessProfileId ?? activeProfileId ?? null;
  const [topProductNames, setTopProductNames] = useState<string[]>([]);

  useEffect(() => {
    if (!createBusinessProfileId) {
      setTopProductNames([]);
      return;
    }
    let cancelled = false;
    fetchProducts(createBusinessProfileId)
      .then((products) => {
        if (cancelled) return;
        setTopProductNames(
          products
            .slice(0, 3)
            .map((p) => p.name)
            .filter(Boolean),
        );
      })
      .catch(() => {
        if (!cancelled) setTopProductNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [createBusinessProfileId]);

  const contentIdeasContext = {
    businessName: activeProfile?.name,
    description: [
      activeProfile?.notes,
      topProductNames.length > 0 ? `Top products: ${topProductNames.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(". ") || undefined,
    audience: activeProfile?.location ? `Customers in ${activeProfile.location}` : undefined,
  };
  const canvaConnected = useMemo(
    () => accounts.some((account) => account.platform === "canva" && !account.disconnectedAt),
    [accounts]
  );
  const selectedAccountId = getSelectedAccountId("content");
  const [contentTab, setContentTab] = useState<ContentTab>("browse");
  const [publishReadiness, setPublishReadiness] = useState<PublishReadiness | null>(null);
  const { history: generatedHistory, recordAsset, remove: removeGenerated, clear: clearGenerated, isLoading: historyLoading } =
    useGeneratedContentHistory();
  const [publishCaption, setPublishCaption] = useState("");

  const ensureBackendSession = useCallback(async () => {
    if (authMode === "local") {
      await fetchWithTimeout(apiUrl("/api/auth/local-session"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => {});
      return;
    }

    if (authMode === "cloud" && accessToken) {
      await fetchWithTimeout(apiUrl("/api/auth/session"), {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      }).catch(() => {});
    }
  }, [authMode, accessToken]);

  const goToTab = useCallback(
    (tab: ContentTab) => {
      setContentTab(tab);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", tab);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (isContentTab(tab)) {
      setContentTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const pending = consumeContentCaption();
    if (!pending) return;
    setPublishCaption(pending);
    goToTab("publish");
    toast.success("Idea added — ready to post or save");
  }, [goToTab]);

  const {
    driveAccounts,
    activeAccount,
    providerData,
    loading,
    error,
    refresh,
    driveSearch,
    setDriveSearch,
    driveSearchRef,
    driveView,
    handleDriveViewChange,
    folderStack,
    navigateIntoFolder,
    navigateBack,
    navigateRoot,
    navigateToBreadcrumb,
    folderItems,
    imageItems,
    videoItems,
    otherItems,
    browseMediaFiles,
    filteredActiveItems,
    driveQuery,
    focusedBrowseFileId,
    focusedBrowseFile,
    navigateBrowseFileRelative,
    popupOauthError,
    setPopupOauthError,
  } = useDriveBrowser({
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    addAccountFromOAuth,
    activeBusinessProfileId,
    activeProfileId,
    ensureBackendSession,
  });

  const {
    selectedAssets,
    selectedIds,
    selectedImages,
    publishMediaUrls,
    uploadingBrowse,
    assetFromDriveFile,
    saveAssetSelection,
    recordGeneratedAsset,
    saveGeneratedToSelection,
    handleBatchIngested,
    handleBrowseUploadFiles,
    toggleAsset,
    removeFromSelected,
    removeManyFromSelected,
    reorderSelected,
    handleClearSelection,
  } = useContentAssetSelection({
    activeProfileId,
    activeAccount,
    createBusinessProfileId,
    ensureBackendSession,
    goToTab,
    recordAsset,
  });

  const combinedOauthError = popupOauthError || oauthErrorDetails;
  const publishBlockedReason = publishBlockReason(publishReadiness);
  const initialCreateMode = useMemo(() => {
    const mode = searchParams.get("mode");
    if (mode === "generate" || mode === "transform" || mode === "batch") return mode;
    return undefined;
  }, [searchParams]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (contentTab !== "browse" || isTypingTarget(e.target) || isShortcutBlocked()) return;

      if (e.key === "/") {
        e.preventDefault();
        driveSearchRef.current?.focus();
        return;
      }

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        navigateBrowseFileRelative(1);
        return;
      }

      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        navigateBrowseFileRelative(-1);
        return;
      }

      if (matchesKey(e, "s") && isPlainLetterShortcut(e) && focusedBrowseFileId) {
        const file = browseMediaFiles.find((item) => item.id === focusedBrowseFileId);
        if (!file || !activeAccount) return;
        e.preventDefault();
        const key = assetSelectionKey({ id: file.id, sourceAccountId: activeAccount.id });
        toggleAsset(file, !selectedIds.has(key));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    contentTab,
    navigateBrowseFileRelative,
    focusedBrowseFileId,
    browseMediaFiles,
    activeAccount,
    selectedIds,
    toggleAsset,
    driveSearchRef,
  ]);

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto">
      <PageHeader
        icon={FolderOpen}
        title="Innehåll"
        description="Välj media från Drive, skapa med apiai.me och publicera eller spara som utkast — allt i ett flöde."
        actions={
          <>
            {driveAccounts.length === 0 ? (
              <Button asChild variant="outline">
                <Link to="/connections?q=drive">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Öppna Kopplingar
                </Link>
              </Button>
            ) : null}
            {activeAccount ? (
              <Button
                variant="ghost"
                onClick={() => void refresh()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Uppdatera
              </Button>
            ) : null}
          </>
        }
      />

      {driveAccounts.length === 0 ? (
        <PageSmartBar
          title="Innehåll är hela flödet — välj media, skapa med AI, spara utkast och publicera."
          steps={[
            "Koppla Google Drive under Kopplingar",
            "Bläddra eller ladda upp — markera det du vill använda",
            "Skapa med AI, spara till Valda och publicera",
          ]}
          tip="När Drive är kopplat försvinner den här guiden — flikarna räcker för flödet."
          extraActions={[{ label: "Öppna Kopplingar", to: "/connections" }]}
        />
      ) : (contentTab === "browse" && browseMediaFiles.length > 0) || selectedAssets.length > 0 ? (
        <PageSmartBar
          title="Innehåll"
          liveHintOverride={
            contentTab === "browse" && browseMediaFiles.length > 0
              ? isMobile
                ? `${browseMediaFiles.length} mediafiler i vyn — markera det du vill använda.`
                : `${browseMediaFiles.length} mediafiler i vyn — J/K bläddra, S välj.`
              : `${selectedAssets.length} valda — gå till Skapa eller Publicera.`
          }
        />
      ) : null}

      {driveAccounts.length === 0 ? <SectionConnectionStatus area="content" className="mt-0" /> : null}

      {contentTab === "create" ? (
        <PageAiSuggestionsStrip
          businessProfileId={createBusinessProfileId}
          kinds={["content", "engagement"]}
          label="AI-idéer för innehåll"
        />
      ) : null}

      <div className="app-workspace-shell !min-h-0">
        <div className="app-workspace-toolbar overflow-x-auto px-2 py-2 sm:px-4">
      <Tabs value={contentTab} onValueChange={(value) => goToTab(value as typeof contentTab)}>
        <div className="flex w-full items-end border-b border-border">
          <TabsList className="h-auto min-w-0 flex-1 justify-start rounded-none border-0 bg-transparent p-0">
            <TabsTrigger
              value="browse"
              className="min-h-11 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2.5 text-sm sm:min-h-0 sm:py-2 sm:text-xs"
            >
              <HardDrive className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="sm:inline">Bläddra</span>
            </TabsTrigger>
            <TabsTrigger
              value="selected"
              className="hidden min-h-11 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2.5 text-sm sm:inline-flex sm:min-h-0 sm:py-2 sm:text-xs"
            >
              <BookmarkCheck className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              Valda
              {selectedAssets.length > 0 ? (
                <span className="ml-0.5 rounded-full bg-primary/15 text-primary px-1.5 text-[11px] tabular-nums sm:text-[10px]">
                  {selectedAssets.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger
              value="create"
              className="hidden min-h-11 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2.5 text-sm sm:inline-flex sm:min-h-0 sm:py-2 sm:text-xs"
            >
              <Wand2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              Skapa
            </TabsTrigger>
            <TabsTrigger
              value="publish"
              className="min-h-11 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2.5 text-sm sm:min-h-0 sm:py-2 sm:text-xs"
            >
              <Send className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              Publicera
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="hidden min-h-11 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2.5 text-sm sm:inline-flex sm:min-h-0 sm:py-2 sm:text-xs"
            >
              <History className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              Historik
              {generatedHistory.length > 0 ? (
                <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[11px] tabular-nums sm:text-[10px]">{generatedHistory.length}</span>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "mb-px min-h-11 shrink-0 gap-1 rounded-none border-b-2 px-3 py-2.5 text-sm sm:hidden",
                  contentTab === "selected" || contentTab === "create" || contentTab === "history"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground"
                )}
                aria-label="Fler flikar"
              >
                <MoreHorizontal className="h-4 w-4" />
                Mer
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => goToTab("selected")}>
                <BookmarkCheck className="mr-2 h-4 w-4" />
                Valda
                {selectedAssets.length > 0 ? (
                  <span className="ml-auto tabular-nums text-muted-foreground">{selectedAssets.length}</span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => goToTab("create")}>
                <Wand2 className="mr-2 h-4 w-4" />
                Skapa
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => goToTab("publish")}>
                <Send className="mr-2 h-4 w-4" />
                Publicera
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => goToTab("history")}>
                <History className="mr-2 h-4 w-4" />
                Historik
                {generatedHistory.length > 0 ? (
                  <span className="ml-auto tabular-nums text-muted-foreground">{generatedHistory.length}</span>
                ) : null}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Tabs>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 p-3 sm:p-4">

      {combinedOauthError ? (
        <OAuthErrorAlert
          details={combinedOauthError}
          message={formatOAuthErrorMessage(combinedOauthError)}
          onDismiss={() => {
            setPopupOauthError(null);
            clearOauthError();
          }}
        />
      ) : null}

      {contentTab === "create" ? (
        <div className="space-y-4">
          <ContentIdeasHub
            businessProfileId={createBusinessProfileId}
            socialContext={contentIdeasContext}
            outreachContext={{
              businessName: contentIdeasContext.businessName,
              description: contentIdeasContext.description,
              location: activeProfile?.location,
              targetAudience: contentIdeasContext.audience,
              idealCustomer: contentIdeasContext.description,
            }}
            onUseIdea={(text) => {
              setPublishCaption(text);
              goToTab("publish");
              toast.success("Idé tillagd — redo att publicera eller spara");
            }}
          />
          <McpFeatureSection
            businessProfileId={createBusinessProfileId}
            featureIds={MCP_PAGE_FEATURE_IDS.content}
            title="MCP-innehållsverktyg"
            description="Generera presentationer (Gamma) eller designbriefs (Canva MCP). Koppla leverantörer under Kopplingar → MCP om status visar saknad nyckel."
          />
          <CreateTab
            businessProfileId={createBusinessProfileId}
            selectedAssets={selectedAssets}
            availableAssets={imageItems.map((file) => assetFromDriveFile(file)).filter((asset): asset is SelectedContentAsset => Boolean(asset))}
            captionHint={publishCaption}
            canvaConnected={canvaConnected}
            onToggleAssetSelection={saveAssetSelection}
            onOpenBrowse={() => goToTab("browse")}
            onOpenSelected={() => goToTab("selected")}
            onBeforeRequest={ensureBackendSession}
            onRecordGenerated={(asset, meta) => recordGeneratedAsset(asset, meta)}
            onSaveResultToSelection={(asset, meta) => {
              saveGeneratedToSelection(asset, meta);
            }}
            onContinueToPublish={() => goToTab("publish")}
            onPublishReadinessChange={setPublishReadiness}
            onBatchIngested={handleBatchIngested}
            onOpenHistory={() => goToTab("history")}
            initialCreateMode={initialCreateMode}
          />
        </div>
      ) : null}

      {contentTab === "selected" ? (
        <SelectedContentPanel
          selectedAssets={selectedAssets}
          historyItems={generatedHistory}
          onRemove={removeFromSelected}
          onRemoveMany={removeManyFromSelected}
          onClear={handleClearSelection}
          onReorder={reorderSelected}
          onAddFromHistory={(asset) => {
            saveAssetSelection(asset, true);
            toast.success("Tillagd i Valda");
          }}
          onUploadFiles={handleBrowseUploadFiles}
          uploading={uploadingBrowse}
          uploadDisabled={!createBusinessProfileId}
          onGoBrowse={() => goToTab("browse")}
          onGoHistory={() => goToTab("history")}
          onCreate={() => goToTab("create")}
          onPublish={() => goToTab("publish")}
        />
      ) : null}

      {contentTab === "history" ? (
        <GeneratedHistoryPanel
          items={generatedHistory}
          loading={historyLoading}
          selectedKeys={selectedIds}
          onAddToSelection={(asset) => {
            saveAssetSelection(asset, true);
            toast.success("Tillagd i Valda");
          }}
          onAddAllToSelection={(assets) => {
            assets.forEach((asset) => saveAssetSelection(asset, true));
            toast.success(`${assets.length} tillagda i Valda`);
            goToTab("selected");
          }}
          onRemove={removeGenerated}
          onClear={() => {
            clearGenerated();
            toast.message("Historik rensad");
          }}
        />
      ) : null}

      {contentTab === "publish" ? (
        <div className="space-y-4">
          <AutomationEnableHint
            compact
            tab="content"
            focus="publish-scheduled-posts"
            title="Schemaläggning körs automatiskt"
            description="När du schemalägger inlägg publiceras de automatiskt var 15:e minut. Innehållspipelinen kan också köa utkast åt dig."
            ctaLabel="Se content-automationer"
          />
          {selectedAssets.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  {generatedHistory.length > 0
                    ? "Lägg till media från Bläddra eller Historik till Valda, sedan publicera."
                    : "Välj minst en bild eller video i Bläddra eller Valda först."}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => goToTab("selected")}>
                    Öppna Valda
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => goToTab("browse")}>
                    Gå till Bläddra
                  </Button>
                  {generatedHistory.length > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => goToTab("history")}>
                      Öppna Historik
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
          <PublishSafetyPanel
            businessProfileId={createBusinessProfileId}
            imageAssets={selectedImages}
            readiness={publishReadiness}
            onReadinessChange={setPublishReadiness}
            onBeforeRequest={ensureBackendSession}
            autoRunModeration
          />
          <PublishComposer
            initialCaption={publishCaption}
            mediaUrls={publishMediaUrls}
            onCaptionChange={setPublishCaption}
            autoSelectAccounts
            publishBlockedReason={publishBlockedReason}
            publishWarning={
              publishReadiness && !publishReadiness.ok && publishReadiness.severity === "warn"
                ? publishReadiness.detail || publishReadiness.label
                : null
            }
          />
        </div>
      ) : null}

      {contentTab === "browse" ? (
        <DriveBrowsePanel
          error={error}
          onRetry={() => void refresh()}
          activeAccountId={activeAccount?.id ?? null}
          driveView={driveView}
          onDriveViewChange={handleDriveViewChange}
          folderStack={folderStack}
          onNavigateBack={navigateBack}
          onNavigateRoot={navigateRoot}
          onNavigateToBreadcrumb={navigateToBreadcrumb}
          onNavigateIntoFolder={navigateIntoFolder}
          driveAccounts={driveAccounts}
          selectedAccountId={selectedAccountId}
          onSelectAccount={(accountId) => setSelectedAccountId("content", accountId)}
          selectedCount={selectedAssets.length}
          onGoSelected={() => goToTab("selected")}
          loading={loading}
          driveSearch={driveSearch}
          onDriveSearchChange={setDriveSearch}
          driveSearchRef={driveSearchRef}
          onUploadFiles={handleBrowseUploadFiles}
          uploading={uploadingBrowse}
          uploadDisabled={!createBusinessProfileId}
          folderItems={folderItems}
          imageItems={imageItems}
          videoItems={videoItems}
          otherItems={otherItems}
          browseMediaFiles={browseMediaFiles}
          filteredActiveItems={filteredActiveItems}
          driveQuery={driveQuery}
          providerData={providerData}
          selectedIds={selectedIds}
          onToggleAsset={toggleAsset}
          focusedFileId={focusedBrowseFileId}
          focusedFile={focusedBrowseFile}
        />
      ) : null}

        </div>
      </div>

      <ContentNextStepBar
        active={contentTab}
        selectionCount={selectedAssets.length}
        historyCount={generatedHistory.length}
        onGo={goToTab}
      />
    </div>
  );
}
