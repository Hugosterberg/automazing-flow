import { useState } from "react";
import { ExternalLink, FolderPlus, Loader2, Send, Sparkles, Wand2 } from "lucide-react";
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
  onGenerated,
  onSaveToSelection,
  onContinueToPublish,
}: {
  businessProfileId: string | null;
  captionHint?: string;
  canvaConnected?: boolean;
  onGenerated: (asset: SelectedContentAsset) => void;
  onSaveToSelection?: (asset: SelectedContentAsset) => void;
  onContinueToPublish?: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [canvaDesignId, setCanvaDesignId] = useState("");
  const [busy, setBusy] = useState<"openai" | "canva" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lastAsset, setLastAsset] = useState<SelectedContentAsset | null>(null);

  async function handleGenerate() {
    const text = prompt.trim() || captionHint.trim();
    if (!text) {
      setError("Write a prompt or add a caption in Post or save first.");
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
      setLastAsset(asset);
      onGenerated(asset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate image");
    } finally {
      setBusy(null);
    }
  }

  async function handleCanvaExport() {
    const designId = normalizeCanvaDesignId(canvaDesignId);
    if (!designId) {
      setError("Paste a Canva design link or ID.");
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
      setLastAsset(asset);
      onGenerated(asset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export Canva design");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Generate or import image
        </CardTitle>
        <CardDescription>
          Create with OpenAI or export a Canva design — saved to History automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px]">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="content-ai-prompt">AI image prompt</Label>
              <Textarea
                id="content-ai-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                placeholder="Describe the marketing image you want…"
              />
            </div>
            <Button type="button" variant="outline" onClick={() => void handleGenerate()} disabled={busy !== null}>
              {busy === "openai" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Generate with AI
            </Button>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                value={canvaDesignId}
                onChange={(event) => setCanvaDesignId(event.target.value)}
                placeholder="Canva design link or ID"
              />
              <Button type="button" variant="outline" onClick={() => void handleCanvaExport()} disabled={busy !== null}>
                {busy === "canva" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                Export Canva
              </Button>
            </div>
            {!canvaConnected ? (
              <p className="text-[11px] text-muted-foreground">Connect Canva under Connections to export designs.</p>
            ) : null}
          </div>
          <div className="rounded-lg border border-dashed border-border bg-muted/20 flex items-center justify-center min-h-[120px] overflow-hidden">
            {previewUrl ? (
              <img src={previewUrl} alt="Latest generated" className="max-h-[120px] object-contain" />
            ) : (
              <p className="text-[11px] text-muted-foreground px-2 text-center">Preview appears here</p>
            )}
          </div>
        </div>
        {lastAsset ? (
          <div className="flex flex-wrap gap-2">
            {onSaveToSelection ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => onSaveToSelection(lastAsset)}>
                <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
                Save to selection
              </Button>
            ) : null}
            {onContinueToPublish ? (
              <Button type="button" size="sm" onClick={onContinueToPublish}>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Continue to post
              </Button>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
