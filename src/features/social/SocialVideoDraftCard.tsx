import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Film, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiJson } from "@/lib/apiJson";
import type { SelectedContentAsset } from "@/lib/contentSelection";

type VideoDraftResult = {
  title: string;
  hook: string;
  concept: string;
  shots: string[];
  caption: string;
  cta: string;
};

/**
 * AI Video Draft: pick one of the selected Google Drive videos and generate a
 * short-form concept (hook, shot list, caption, CTA). Fully self-contained —
 * the page only feeds it the currently selected video assets.
 */
export function SocialVideoDraftCard({ videos }: { videos: SelectedContentAsset[] }) {
  const { t } = useTranslation("social");
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoPlatform, setVideoPlatform] = useState("");
  const [videoObjective, setVideoObjective] = useState("");
  const [generating, setGenerating] = useState(false);
  const [draftSource, setDraftSource] = useState<string | null>(null);
  const [draft, setDraft] = useState<VideoDraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVideoPlatform(t("videoDraft.platformPlaceholder"));
    setVideoObjective(t("videoDraft.objectiveDefault"));
  }, [t]);

  useEffect(() => {
    if (!selectedVideoId && videos.length > 0) {
      setSelectedVideoId(videos[0].id);
    }
    if (selectedVideoId && !videos.some((asset) => asset.id === selectedVideoId)) {
      setSelectedVideoId(videos[0]?.id || null);
    }
  }, [videos, selectedVideoId]);

  const selectedVideoAsset = videos.find((asset) => asset.id === selectedVideoId) ?? videos[0] ?? null;

  async function handleGenerate() {
    if (!selectedVideoAsset) return;
    setGenerating(true);
    setDraft(null);
    setError(null);
    try {
      const result = await apiJson("/api/content/video-draft", t("videoDraft.generateError"), {
        body: {
          asset: {
            id: selectedVideoAsset.id,
            name: selectedVideoAsset.name,
            mimeType: selectedVideoAsset.mimeType,
            kind: selectedVideoAsset.kind,
            webViewLink: selectedVideoAsset.webViewLink,
          },
          prompt: videoPrompt,
          platform: videoPlatform,
          objective: videoObjective,
        },
      });
      setDraft(result.draft);
      setDraftSource(result.source);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("videoDraft.generateError"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card className="bg-card border-border glow-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Film className="h-5 w-5" />
          {t("videoDraft.title")}
        </CardTitle>
        <CardDescription>{t("videoDraft.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {videos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("videoDraft.empty")}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] gap-4">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("videoDraft.sourceVideo")}</p>
                <div className="space-y-2">
                  {videos.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setSelectedVideoId(asset.id)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        selectedVideoAsset?.id === asset.id
                          ? "border-primary bg-primary/5"
                          : "border-border bg-secondary/20 hover:bg-secondary/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-md overflow-hidden bg-secondary/60 flex items-center justify-center shrink-0">
                          <ImageWithFallback
                            src={asset.thumbnailUrl}
                            alt={asset.name}
                            className="w-full h-full object-cover"
                            fallback={<Film className="h-5 w-5 text-muted-foreground" />}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{asset.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{asset.mimeType || "video/*"}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="video-platform">{t("videoDraft.platform")}</Label>
                    <Input
                      id="video-platform"
                      value={videoPlatform}
                      onChange={(e) => setVideoPlatform(e.target.value)}
                      placeholder={t("videoDraft.platformPlaceholder")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="video-objective">{t("videoDraft.objective")}</Label>
                    <Input
                      id="video-objective"
                      value={videoObjective}
                      onChange={(e) => setVideoObjective(e.target.value)}
                      placeholder={t("videoDraft.objectivePlaceholder")}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="video-prompt">{t("videoDraft.guidance")}</Label>
                  <Textarea
                    id="video-prompt"
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    placeholder={t("videoDraft.guidancePlaceholder")}
                    className="bg-secondary border-border min-h-[96px] resize-none"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => void handleGenerate()} disabled={!selectedVideoAsset || generating}>
                    {generating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Film className="h-4 w-4 mr-2" />
                    )}
                    {generating ? t("videoDraft.generating") : t("videoDraft.generate")}
                  </Button>
                  {selectedVideoAsset?.webViewLink && (
                    <Button variant="outline" asChild>
                      <a href={selectedVideoAsset.webViewLink} target="_blank" rel="noopener noreferrer">
                        {t("videoDraft.openSource")}
                      </a>
                    </Button>
                  )}
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            </div>

            {draft && (
              <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                    {draftSource === "openai" ? t("videoDraft.badgeAi") : t("videoDraft.badgeFallback")}
                  </span>
                  <span>{t("videoDraft.builtFrom", { name: selectedVideoAsset?.name })}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("videoDraft.fields.title")}</p>
                  <p className="text-sm">{draft.title}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("videoDraft.fields.hook")}</p>
                  <p className="text-sm">{draft.hook}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("videoDraft.fields.concept")}</p>
                  <p className="text-sm">{draft.concept}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("videoDraft.fields.shotList")}</p>
                  <div className="space-y-2">
                    {draft.shots.map((shot, index) => (
                      <div key={`${shot}-${index}`} className="rounded-md border border-border/70 bg-background/80 p-3">
                        <p className="text-sm">{shot}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("videoDraft.fields.caption")}</p>
                    <p className="text-sm">{draft.caption}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("videoDraft.fields.cta")}</p>
                    <p className="text-sm">{draft.cta}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
