import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clapperboard,
  Import,
  Loader2,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { SelectedContentAsset } from "@/lib/contentSelection";
import {
  composeReel,
  fetchReelUploadParams,
  uploadReelClip,
  type ReelComposeResult,
  type ReelUploadParams,
} from "./reelClient";

const MAX_CLIPS = 10;
const MAX_CLIP_BYTES = 200 * 1024 * 1024;

type ReelClip = {
  localId: string;
  name: string;
  status: "uploading" | "ready" | "error";
  progress: number;
  publicId?: string;
  duration?: number;
  error?: string;
};

type Props = {
  businessProfileId: string | null;
  /** Video assets already in the "Valda" selection (e.g. from Google Drive). */
  selectedVideoAssets: SelectedContentAsset[];
  onBeforeRequest?: () => Promise<void>;
  /** Adds the finished reel to selection + history (existing content flow). */
  onSaveResult: (asset: SelectedContentAsset) => void;
  onGoPublish: () => void;
};

let clipCounter = 0;
function nextClipId() {
  clipCounter += 1;
  return `clip-${Date.now()}-${clipCounter}`;
}

/**
 * Stitch short clips into a 30/60s 9:16 reel for Reels/TikTok.
 *
 * On iPhone the file input opens the native photo picker, which includes
 * iCloud Photos and shared albums — that is the supported way to reach
 * iCloud media from the web. Clips upload directly to Cloudinary and are
 * concatenated server-side into a permanent mp4 URL the publish flow can use.
 */
export function ReelBuilderPanel({
  businessProfileId,
  selectedVideoAssets,
  onBeforeRequest,
  onSaveResult,
  onGoPublish,
}: Props) {
  const { t } = useTranslation("content");
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadParamsRef = useRef<ReelUploadParams | null>(null);
  const [clips, setClips] = useState<ReelClip[]>([]);
  const [target, setTarget] = useState<30 | 60>(30);
  const [notConfigured, setNotConfigured] = useState(false);
  const [composing, setComposing] = useState(false);
  const [result, setResult] = useState<ReelComposeResult | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const readyClips = useMemo(() => clips.filter((c) => c.status === "ready"), [clips]);
  const uploading = clips.some((c) => c.status === "uploading");

  const importableAssets = useMemo(
    () =>
      selectedVideoAssets.filter(
        (asset) => Boolean(asset.previewUrl) && !clips.some((c) => c.name === asset.name && c.status !== "error")
      ),
    [selectedVideoAssets, clips]
  );

  function patchClip(localId: string, patch: Partial<ReelClip>) {
    setClips((prev) => prev.map((c) => (c.localId === localId ? { ...c, ...patch } : c)));
  }

  async function ensureUploadParams(): Promise<ReelUploadParams | null> {
    if (!businessProfileId) return null;
    // Signatures are timestamped; reuse for ~30 min, then refresh.
    const cached = uploadParamsRef.current;
    if (cached && Date.now() / 1000 - cached.timestamp < 30 * 60) return cached;
    await onBeforeRequest?.();
    try {
      const params = await fetchReelUploadParams(businessProfileId);
      uploadParamsRef.current = params;
      setNotConfigured(false);
      return params;
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (/cloudinary/i.test(message) || /501/.test(message)) setNotConfigured(true);
      throw e;
    }
  }

  async function uploadBlob(blob: Blob, name: string) {
    if (clips.length >= MAX_CLIPS) {
      toast.message(t("reel.maxClips", { count: MAX_CLIPS }));
      return;
    }
    if (blob.size > MAX_CLIP_BYTES) {
      toast.error(t("reel.tooLarge", { name }));
      return;
    }
    const localId = nextClipId();
    setResult(null);
    setClips((prev) => [...prev, { localId, name, status: "uploading", progress: 0 }]);
    try {
      const params = await ensureUploadParams();
      if (!params) throw new Error(t("reel.errors.uploadParams"));
      const uploaded = await uploadReelClip(blob, name, params, (fraction) =>
        patchClip(localId, { progress: fraction })
      );
      if (!uploaded.duration) {
        patchClip(localId, { status: "error", error: t("reel.errors.noDuration") });
        return;
      }
      patchClip(localId, {
        status: "ready",
        progress: 1,
        publicId: uploaded.publicId,
        duration: uploaded.duration,
      });
    } catch (e) {
      patchClip(localId, {
        status: "error",
        error: e instanceof Error ? e.message : t("reel.errors.uploadFailed"),
      });
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith("video/")) continue;
      await uploadBlob(file, file.name);
    }
  }

  async function importAsset(asset: SelectedContentAsset) {
    if (!asset.previewUrl) return;
    setImportingId(asset.id);
    try {
      const url = /^https?:\/\//i.test(asset.previewUrl) ? asset.previewUrl : apiUrl(asset.previewUrl);
      // Generous timeout — this downloads a video clip, not a JSON response.
      const res = await fetchWithTimeout(url, { credentials: "include" }, 90_000);
      if (!res.ok) throw new Error(t("reel.errors.importFailed"));
      const blob = await res.blob();
      await uploadBlob(blob, asset.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("reel.errors.importFailed"));
    } finally {
      setImportingId(null);
    }
  }

  function moveClip(localId: string, delta: number) {
    setClips((prev) => {
      const index = prev.findIndex((c) => c.localId === localId);
      const next = index + delta;
      if (index === -1 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [clip] = copy.splice(index, 1);
      copy.splice(next, 0, clip!);
      return copy;
    });
    setResult(null);
  }

  function removeClip(localId: string) {
    setClips((prev) => prev.filter((c) => c.localId !== localId));
    setResult(null);
  }

  async function handleCompose() {
    if (!businessProfileId || readyClips.length === 0) return;
    setComposing(true);
    setResult(null);
    try {
      await onBeforeRequest?.();
      const composed = await composeReel({
        clips: readyClips.map((clip) => ({
          publicId: clip.publicId!,
          duration: clip.duration!,
        })),
        target,
        businessProfileId,
      });
      setResult(composed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("reel.errors.composeFailed"));
    } finally {
      setComposing(false);
    }
  }

  function handleUseInPublish() {
    if (!result) return;
    const asset: SelectedContentAsset = {
      id: `reel-${Date.now()}`,
      name: t("reel.assetName", { seconds: Math.round(result.totalSeconds) }),
      mimeType: "video/mp4",
      kind: "video",
      thumbnailUrl: result.posterUrl,
      previewUrl: result.url,
      sourceAccountId: "reel",
      sourceAccountName: t("reel.sourceName"),
    };
    onSaveResult(asset);
    onGoPublish();
  }

  const totalReady = readyClips.reduce((sum, c) => sum + (c.duration || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clapperboard className="h-4 w-4 text-primary" />
          {t("reel.title")}
        </CardTitle>
        <CardDescription>{t("reel.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notConfigured ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            {t("reel.notConfigured")}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void handleFiles(event.target.files);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!businessProfileId || uploading || clips.length >= MAX_CLIPS}
            onClick={() => inputRef.current?.click()}
          >
            <Smartphone className="mr-1.5 h-4 w-4" />
            {t("reel.pickFromDevice")}
          </Button>
          {importableAssets.map((asset) => (
            <Button
              key={`${asset.sourceAccountId}:${asset.id}`}
              type="button"
              variant="ghost"
              size="sm"
              className="max-w-[220px]"
              disabled={Boolean(importingId) || uploading || clips.length >= MAX_CLIPS}
              onClick={() => void importAsset(asset)}
              title={asset.name}
            >
              {importingId === asset.id ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Import className="mr-1.5 h-3.5 w-3.5" />
              )}
              <span className="truncate">{asset.name}</span>
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("reel.iphoneHint")}</p>

        {clips.length > 0 ? (
          <ol className="space-y-1.5">
            {clips.map((clip, index) => (
              <li
                key={clip.localId}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5",
                  clip.status === "error" && "border-destructive/50 bg-destructive/5"
                )}
              >
                <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{clip.name}</p>
                  {clip.status === "uploading" ? (
                    <Progress value={clip.progress * 100} className="mt-1 h-1.5" />
                  ) : clip.status === "error" ? (
                    <p className="text-xs text-destructive">{clip.error}</p>
                  ) : null}
                </div>
                {clip.status === "ready" ? (
                  <Badge variant="secondary" className="shrink-0 gap-1 text-[11px] tabular-nums">
                    <Check className="h-3 w-3" />
                    {Math.round(clip.duration || 0)}s
                  </Badge>
                ) : clip.status === "uploading" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : null}
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={t("reel.moveUp")}
                    disabled={index === 0}
                    onClick={() => moveClip(clip.localId, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={t("reel.moveDown")}
                    disabled={index === clips.length - 1}
                    onClick={() => moveClip(clip.localId, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    aria-label={t("reel.remove")}
                    onClick={() => removeClip(clip.localId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            {t("reel.empty")}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("reel.targetLabel")}</span>
          {[30, 60].map((seconds) => (
            <Button
              key={seconds}
              type="button"
              size="sm"
              variant={target === seconds ? "default" : "outline"}
              className="h-8 px-3 tabular-nums"
              onClick={() => {
                setTarget(seconds as 30 | 60);
                setResult(null);
              }}
            >
              {seconds}s
            </Button>
          ))}
          {readyClips.length > 0 ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("reel.materialSummary", {
                count: readyClips.length,
                seconds: Math.round(totalReady),
              })}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            disabled={readyClips.length === 0 || uploading || composing || !businessProfileId}
            onClick={() => void handleCompose()}
          >
            {composing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {t("reel.compose")}
          </Button>
        </div>

        {result ? (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium">
              {t("reel.resultTitle", { seconds: Math.round(result.totalSeconds) })}
            </p>
            <video
              controls
              playsInline
              preload="metadata"
              poster={result.posterUrl}
              src={result.url}
              className="mx-auto max-h-[420px] rounded-md bg-black"
            />
            <p className="text-xs text-muted-foreground">{t("reel.resultHint")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={handleUseInPublish}>
                {t("reel.useInPublish")}
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={result.url} target="_blank" rel="noreferrer noopener">
                  {t("reel.openVideo")}
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
