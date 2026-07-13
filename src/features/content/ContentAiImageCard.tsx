import { useState, type RefObject } from "react";
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
  title = "Generera eller importera bild",
  description = "Skapa med OpenAI eller exportera en Canva-design — sparas automatiskt i historiken.",
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
  /** Save to History and selection immediately after generate/export. */
  autoSaveToSelection?: boolean;
  /** Jump to Post or save when autoSaveToSelection completes. */
  autoContinueToPublish?: boolean;
}) {
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
      setError(embedded ? "Beskriv bilden eller skriv en bildtext först." : "Skriv en prompt eller lägg till en bildtext under Publicera eller Spara först.");
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
      setError(e instanceof Error ? e.message : "Kunde inte generera bild");
    } finally {
      setBusy(null);
    }
  }

  async function handleCanvaExport() {
    const designId = normalizeCanvaDesignId(canvaDesignId);
    if (!designId) {
      setError("Klistra in en Canva-designlänk eller ID.");
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
      setError(e instanceof Error ? e.message : "Kunde inte exportera Canva-design");
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
            aria-label="Upload image"
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
              <img src={localPreviewUrl} alt="Uploaded preview" className="w-full h-full object-cover rounded-lg" />
            ) : (
              <ImagePlus className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
        ) : null}
        <div className={`space-y-3 ${embedded ? "flex-1 min-w-[220px]" : ""}`}>
          <div className="space-y-2">
            <Label htmlFor={promptId}>AI-bildprompt</Label>
            <Textarea
              id={promptId}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={embedded ? 3 : 3}
              placeholder={embedded ? "Beskriv bilden du vill ha till inlägget…" : "Beskriv marknadsföringsbilden du vill ha…"}
              className={embedded ? "min-h-[80px]" : undefined}
            />
          </div>
          <Button type="button" variant="outline" onClick={() => void handleGenerate()} disabled={busy !== null}>
            {busy === "openai" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
            {busy === "openai" ? "Genererar bild…" : "Generera med AI"}
          </Button>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              ref={canvaInputRef}
              value={canvaDesignId}
              onChange={(event) => setCanvaDesignId(event.target.value)}
              placeholder="Canva-designlänk eller ID"
            />
            <Button type="button" variant="outline" onClick={() => void handleCanvaExport()} disabled={busy !== null}>
              {busy === "canva" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
              Export Canva
            </Button>
          </div>
          {!canvaConnected ? (
            embedded ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <span>Canva är inte kopplad för den här profilen.</span>
                <Button variant="link" size="sm" className="h-auto px-0 py-0 text-xs" asChild>
                  <Link to="/connections">Koppla Canva</Link>
                </Button>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Koppla Canva under Kopplingar för att exportera designs.</p>
            )
          ) : null}
          {embedded ? (
            <p className="text-xs text-muted-foreground">
              Local uploads are stored on the server and can be published with your post.
            </p>
          ) : null}
        </div>
        {!embedded ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 flex items-center justify-center min-h-[120px] overflow-hidden">
            {preview ? (
              <img src={preview} alt="Latest generated" className="max-h-[120px] object-contain" />
            ) : (
              <p className="text-[11px] text-muted-foreground px-2 text-center">Förhandsgranskning visas här</p>
            )}
          </div>
        ) : null}
      </div>
      {embedded && preview && !localPreviewUrl?.startsWith("blob:") ? (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Redo att publiceras med ditt inlägg.</p>
        </div>
      ) : null}
      {showContentActions && lastAsset ? (
        <div className="flex flex-wrap gap-2">
          {onSaveToSelection ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => onSaveToSelection(lastAsset)}>
              <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
              Spara till urval
            </Button>
          ) : null}
          {onContinueToPublish ? (
            <Button type="button" size="sm" onClick={onContinueToPublish}>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Fortsätt till inlägg
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
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{controls}</CardContent>
    </Card>
  );
}
