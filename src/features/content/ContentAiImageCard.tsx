import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, FolderPlus, ImagePlus, Loader2, Send, Sparkles, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SelectedContentAsset } from "@/lib/contentSelection";
import { exportCanvaImage, generateSocialImage, normalizeCanvaDesignId } from "./contentMediaClient";

export function ContentAiImageCard({
  businessProfileId,
  captionHint = "",
  canvaConnected = false,
  embedded = false,
  allowLocalUpload = false,
  localPreviewUrl = null,
  onLocalUploadClick,
  canvaInputRef,
  showContentActions = true,
  title,
  description,
  onGenerated,
  onSaveToSelection,
  onContinueToPublish,
  autoSaveToSelection = false,
  autoContinueToPublish = false,
}: {
  businessProfileId: string | null;
  captionHint?: string;
  canvaConnected?: boolean;
  embedded?: boolean;
  allowLocalUpload?: boolean;
  localPreviewUrl?: string | null;
  onLocalUploadClick?: () => void;
  canvaInputRef?: RefObject<HTMLInputElement | null>;
  showContentActions?: boolean;
  title?: string;
  description?: string;
  onGenerated: (asset: SelectedContentAsset) => void;
  onSaveToSelection?: (asset: SelectedContentAsset) => void;
  onContinueToPublish?: () => void;
  autoSaveToSelection?: boolean;
  autoContinueToPublish?: boolean;
}) {
  const { t } = useTranslation("content");
  const cardTitle = title ?? t("aiImage.title");
  const cardDescription = description ?? t("aiImage.description");
  const [prompt, setPrompt] = useState("");
  const [canvaDesignId, setCanvaDesignId] = useState("");
  const [busy, setBusy] = useState<"openai" | "canva" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lastAsset, setLastAsset] = useState<SelectedContentAsset | null>(null);
  const promptId = embedded ? "social-ai-prompt" : "content-ai-prompt";

  function finishWithAsset(asset: SelectedContentAsset) {
    setLastAsset(asset);
    if (autoSaveToSelection && onSaveToSelection) {
      onSaveToSelection(asset);
      if (autoContinueToPublish) onContinueToPublish?.();
    } else {
      onGenerated(asset);
    }
  }

  async function handleGenerate() {
    const text = prompt.trim() || captionHint.trim();
    if (!text) {
      setError(embedded ? t("aiImage.promptRequiredEmbedded") : t("aiImage.promptRequired"));
      return;
    }
    setBusy("openai");
    setError(null);
    try {
      const result = await generateSocialImage({
        prompt: text,
        caption: captionHint,
        businessProfileId,
      });
      const url = result.url;
      setPreviewUrl(result.previewUrl || url);
      const asset: SelectedContentAsset = {
        id: `openai-${Date.now()}`,
        name: "ai-generated.png",
        mimeType: "image/png",
        kind: "image",
        thumbnailUrl: result.previewUrl || url,
        previewUrl: url,
        sourceAccountId: "openai",
        sourceAccountName: "OpenAI",
      };
      finishWithAsset(asset);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("aiImage.generateFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleCanvaExport() {
    const designId = normalizeCanvaDesignId(canvaDesignId);
    if (!designId) {
      setError(t("aiImage.canvaIdRequired"));
      return;
    }
    setBusy("canva");
    setError(null);
    try {
      const result = await exportCanvaImage({ designId, businessProfileId });
      setPreviewUrl(result.url);
      const asset: SelectedContentAsset = {
        id: `canva-${Date.now()}`,
        name: "canva-export.png",
        mimeType: "image/png",
        kind: "image",
        thumbnailUrl: result.url,
        previewUrl: result.url,
        sourceAccountId: "canva",
        sourceAccountName: "Canva",
      };
      finishWithAsset(asset);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("aiImage.canvaExportFailed"));
    } finally {
      setBusy(null);
    }
  }

  const preview = previewUrl || localPreviewUrl;

  const controls = (
    <div className="space-y-4">
      <div className={`flex flex-wrap gap-4 items-start ${embedded ? "" : "md:grid md:grid-cols-[minmax(0,1fr)_120px]"}`}>
        {allowLocalUpload ? (
          <div
            role="button"
            tabIndex={0}
            aria-label={t("aiImage.uploadAria")}
            onClick={onLocalUploadClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onLocalUploadClick?.();
              }
            }}
            className="w-32 h-32 rounded-lg border-2 border-dashed border-border hover:border-muted-foreground/50 hover:bg-secondary/50 cursor-pointer flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {localPreviewUrl ? (
              <img src={localPreviewUrl} alt={t("aiImage.uploadedPreview")} className="w-full h-full object-cover rounded-lg" />
            ) : (
              <ImagePlus className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
        ) : null}
        <div className={`space-y-3 ${embedded ? "flex-1 min-w-[220px]" : ""}`}>
          <div className="space-y-2">
            <Label htmlFor={promptId}>{t("aiImage.promptLabel")}</Label>
            <Textarea
              id={promptId}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={embedded ? 3 : 3}
              placeholder={embedded ? t("aiImage.promptPlaceholderEmbedded") : t("aiImage.promptPlaceholder")}
              className={embedded ? "min-h-[80px]" : undefined}
            />
          </div>
          <Button type="button" variant="outline" onClick={() => void handleGenerate()} disabled={busy !== null}>
            {busy === "openai" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
            {busy === "openai" ? t("aiImage.generating") : t("aiImage.generate")}
          </Button>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              ref={canvaInputRef}
              value={canvaDesignId}
              onChange={(event) => setCanvaDesignId(event.target.value)}
              placeholder={t("aiImage.canvaPlaceholder")}
            />
            <Button type="button" variant="outline" onClick={() => void handleCanvaExport()} disabled={busy !== null}>
              {busy === "canva" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
              {t("aiImage.exportCanva")}
            </Button>
          </div>
          {!canvaConnected ? (
            embedded ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <span>{t("aiImage.canvaNotConnected")}</span>
                <Button variant="link" size="sm" className="h-auto px-0 py-0 text-xs" asChild>
                  <Link to="/connections">{t("aiImage.connectCanva")}</Link>
                </Button>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">{t("aiImage.canvaHint")}</p>
            )
          ) : null}
          {embedded ? (
            <p className="text-xs text-muted-foreground">{t("aiImage.localUploadHint")}</p>
          ) : null}
        </div>
        {!embedded ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 flex items-center justify-center min-h-[120px] overflow-hidden">
            {preview ? (
              <img src={preview} alt={t("aiImage.latestGenerated")} className="max-h-[120px] object-contain" />
            ) : (
              <p className="text-[11px] text-muted-foreground px-2 text-center">{t("aiImage.previewHere")}</p>
            )}
          </div>
        ) : null}
      </div>
      {embedded && preview && !localPreviewUrl?.startsWith("blob:") ? (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">{t("aiImage.readyToPublish")}</p>
        </div>
      ) : null}
      {showContentActions && lastAsset ? (
        <div className="flex flex-wrap gap-2">
          {onSaveToSelection ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => onSaveToSelection(lastAsset)}>
              <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
              {t("aiImage.saveToSelection")}
            </Button>
          ) : null}
          {onContinueToPublish ? (
            <Button type="button" size="sm" onClick={onContinueToPublish}>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {t("create.continueToPublish")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );

  if (embedded) return controls;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {cardTitle}
        </CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>{controls}</CardContent>
    </Card>
  );
}
