import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, Loader2, RefreshCw, Send, Wand2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SelectedContentAsset } from "@/lib/contentSelection";
import { apiUrl } from "@/lib/apiBase";
import {
  listApiaiTools,
  runApiaiTool,
  estimateApiaiTool,
  type ApiaiCostEstimate,
  type ApiaiParam,
  type ApiaiRunResult,
  type ApiaiTool,
} from "./apiaiClient";
import { ImageAssetPicker } from "./ImageAssetPicker";
import { ContentAiImageCard } from "./ContentAiImageCard";
import { ApiaiStatusBar } from "./ApiaiStatusBar";
import { ApiaiBatchPanel } from "./ApiaiBatchPanel";
import { insightFromApiaiResult, type PublishReadiness } from "./apiaiResultInsights";
import {
  APIAI_DOCUMENTED_IMAGE_ACTIONS,
  findToolForAction,
  groupToolsByType,
  type ApiaiDocumentedImageAction,
} from "./apiaiQuickActions";

function paramKey(param: ApiaiParam): string {
  return String(param.expose_name || param.name || "").trim();
}

function isPromptParam(param: ApiaiParam): boolean {
  return paramKey(param).toLowerCase() === "prompt";
}

function isOutputFilenameParam(param: ApiaiParam): boolean {
  return paramKey(param).toLowerCase() === "output_filename";
}

function toolNeedsImage(tool: ApiaiTool | null): boolean {
  if (!tool) return false;
  return tool.requiredInputs.some((input) => ["image", "video"].includes(input.toLowerCase()))
    || tool.params.some((param) => Boolean(param.required && param.is_image));
}

function toolAcceptsVideo(tool: ApiaiTool | null): boolean {
  if (!tool) return false;
  return tool.acceptedInputs.some((input) => input.toLowerCase() === "video")
    || tool.requiredInputs.some((input) => input.toLowerCase() === "video");
}

function toolSupportsPrompt(tool: ApiaiTool | null): boolean {
  if (!tool) return true;
  if (tool.supportsPrompt != null) return tool.supportsPrompt;
  return tool.acceptedInputs.includes("prompt")
    || tool.requiredInputs.includes("prompt")
    || tool.params.some((param) => isPromptParam(param));
}

function toolRequiresPrompt(tool: ApiaiTool | null): boolean {
  if (!tool) return false;
  return tool.requiredInputs.some((input) => input.toLowerCase() === "prompt")
    || tool.params.some((param) => param.required && isPromptParam(param));
}

function outputKind(tool: ApiaiTool | null): string {
  if (!tool) return "";
  const outputs = tool.outputTypes.length > 0 ? tool.outputTypes : tool.responseType ? [tool.responseType] : [];
  return outputs.length > 0 ? outputs.join(", ") : "dynamic";
}

function formatHeaderValue(value?: string | null) {
  return value && value.trim() ? value : null;
}

export function CreateTab({
  businessProfileId,
  selectedAssets,
  availableAssets = [],
  captionHint = "",
  canvaConnected = false,
  onToggleAssetSelection,
  onOpenBrowse,
  onBeforeRequest,
  onRecordGenerated,
  onSaveResultToSelection,
  onContinueToPublish,
  onPublishReadinessChange,
}: {
  businessProfileId: string | null;
  selectedAssets: SelectedContentAsset[];
  availableAssets?: SelectedContentAsset[];
  captionHint?: string;
  canvaConnected?: boolean;
  onToggleAssetSelection?: (asset: SelectedContentAsset, selected: boolean) => void;
  onOpenBrowse: () => void;
  onBeforeRequest?: () => Promise<void>;
  onRecordGenerated?: (asset: SelectedContentAsset, meta?: { toolName?: string }) => void;
  onSaveResultToSelection?: (asset: SelectedContentAsset, meta?: { toolName?: string }) => void;
  onContinueToPublish?: () => void;
  onPublishReadinessChange?: (readiness: PublishReadiness | null) => void;
}) {
  const [tools, setTools] = useState<ApiaiTool[]>([]);
  const [selectedToolKey, setSelectedToolKey] = useState("");
  const [loadingTools, setLoadingTools] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [outputFilename, setOutputFilename] = useState("");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiaiRunResult | null>(null);
  const [toolOverride, setToolOverride] = useState<ApiaiTool | null>(null);
  const [costEstimate, setCostEstimate] = useState<ApiaiCostEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [publishInsight, setPublishInsight] = useState<PublishReadiness | null>(null);
  const [createMode, setCreateMode] = useState<"generate" | "transform" | "batch">("generate");

  const selectedTool = useMemo(
    () =>
      toolOverride ??
      tools.find((tool) => `${tool.type}:${tool.slug}` === selectedToolKey) ??
      null,
    [tools, selectedToolKey, toolOverride]
  );
  const quickActions = useMemo(
    () =>
      APIAI_DOCUMENTED_IMAGE_ACTIONS.map((action) => ({
        action,
        tool: findToolForAction(action, tools),
      })),
    [tools]
  );
  const groupedTools = useMemo(() => groupToolsByType(tools), [tools]);

  const editableParams = useMemo(
    () =>
      (selectedTool?.params ?? []).filter(
        (param) => !param.is_image && !isPromptParam(param) && !isOutputFilenameParam(param) && paramKey(param)
      ),
    [selectedTool]
  );

  const usableAssets = useMemo(() => {
    if (!selectedTool) return selectedAssets.filter((asset) => asset.kind === "image");
    return selectedAssets.filter((asset) => toolAcceptsVideo(selectedTool) || asset.kind === "image");
  }, [selectedAssets, selectedTool]);
  const batchImageAssets = useMemo(
    () => selectedAssets.filter((asset) => asset.kind === "image"),
    [selectedAssets]
  );

  const excludedAssets = selectedAssets.filter((asset) => !usableAssets.includes(asset));
  const needsImage = toolNeedsImage(selectedTool);
  const supportsPrompt = toolSupportsPrompt(selectedTool);
  const requiresPrompt = toolRequiresPrompt(selectedTool);

  async function loadTools() {
    if (!businessProfileId) return;
    setLoadingTools(true);
    setToolsError(null);
    try {
      await onBeforeRequest?.();
      const nextTools = await listApiaiTools(businessProfileId);
      setTools(nextTools);
      setSelectedToolKey((current) => current || (nextTools[0] ? `${nextTools[0].type}:${nextTools[0].slug}` : ""));
    } catch (error) {
      setToolsError(error instanceof Error ? error.message : "Could not load apiai.me tools.");
    } finally {
      setLoadingTools(false);
    }
  }

  useEffect(() => {
    void loadTools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessProfileId]);

  useEffect(() => {
    if (!selectedTool) return;
    const defaults: Record<string, string> = {};
    for (const param of editableParams) {
      const key = paramKey(param);
      if (!key) continue;
      defaults[key] = param.default_value == null ? "" : String(param.default_value);
    }
    setParamValues(defaults);
    setResult(null);
    setRunError(null);
    setCostEstimate(null);
    setPublishInsight(null);
    onPublishReadinessChange?.(null);
  }, [selectedTool, editableParams, onPublishReadinessChange]);

  async function runWithTool(
    tool: ApiaiTool,
    input?: { prompt?: string; outputFilename?: string; assets?: SelectedContentAsset[] }
  ) {
    if (!businessProfileId) return;

    const runPrompt = input?.prompt ?? prompt;
    const runOutputFilename = input?.outputFilename ?? outputFilename;
    const assetsForTool =
      input?.assets ??
      selectedAssets.filter((asset) => toolAcceptsVideo(tool) || asset.kind === "image");
    const needsImageForTool = toolNeedsImage(tool);
    const requiresPromptForTool = toolRequiresPrompt(tool);

    if (needsImageForTool && assetsForTool.length === 0) {
      setRunError("This tool needs an image. Select one or more images in Browse first.");
      return;
    }
    if (requiresPromptForTool && !runPrompt.trim()) {
      setRunError("This tool requires a prompt.");
      return;
    }

    setRunning(true);
    setRunError(null);
    setResult(null);
    try {
      await onBeforeRequest?.();
      const maxAssets = Math.max(1, Number(tool.maxImages || 1));
      const nextResult = await runApiaiTool({
        businessProfileId,
        tool,
        prompt: runPrompt,
        params: paramValues,
        assets: assetsForTool.slice(0, maxAssets),
        outputFilename: runOutputFilename,
      });
      setResult(nextResult);
      const insight = insightFromApiaiResult(nextResult, tool);
      setPublishInsight(insight);
      onPublishReadinessChange?.(insight);
      if (nextResult.resultType === "binary" && nextResult.contentType.startsWith("image/") && onRecordGenerated) {
        const url = resultMediaUrl(nextResult);
        if (url) {
          onRecordGenerated({
            id: `apiai-${Date.now()}`,
            name: nextResult.filename,
            mimeType: nextResult.contentType,
            kind: "image",
            thumbnailUrl: url,
            previewUrl: url,
            sourceAccountId: "apiai",
            sourceAccountName: "apiai.me",
          }, { toolName: tool.name });
        }
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "apiai.me generation failed.");
    } finally {
      setRunning(false);
    }
  }

  async function handleRun() {
    if (!selectedTool) return;
    await runWithTool(selectedTool);
  }

  async function handleEstimate() {
    if (!businessProfileId || !selectedTool) return;
    setEstimating(true);
    setRunError(null);
    try {
      await onBeforeRequest?.();
      const estimate = await estimateApiaiTool({
        businessProfileId,
        tool: selectedTool,
        params: paramValues,
      });
      setCostEstimate(estimate);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Could not estimate cost.");
    } finally {
      setEstimating(false);
    }
  }

  function applyQuickAction(action: ApiaiDocumentedImageAction, tool: ApiaiTool | null) {
    if (!tool) return;
    setCreateMode("transform");
    setToolOverride(tool);
    setSelectedToolKey(`${tool.type}:${tool.slug}`);
    setOutputFilename((current) => current || action.defaultOutputFilename);
    const nextPrompt = action.promptPlaceholder || "";
    if (nextPrompt) {
      setPrompt((current) => current || nextPrompt);
    }

    const canRunInstantly =
      batchImageAssets.length > 0 &&
      action.requiresImage !== false &&
      !toolRequiresPrompt(tool) &&
      !action.requiresPrompt;

    if (canRunInstantly) {
      void runWithTool(tool, {
        prompt: nextPrompt,
        outputFilename: action.defaultOutputFilename,
        assets: batchImageAssets,
      });
    }
  }

  function resultMediaUrl(run: ApiaiRunResult): string | null {
    if (run.resultType !== "binary") return null;
    if (run.mediaUrl) return run.mediaUrl.startsWith("http") ? run.mediaUrl : apiUrl(run.mediaUrl);
    return run.dataUrl ?? null;
  }

  function saveResultToSelection() {
    if (!result || result.resultType !== "binary" || !onSaveResultToSelection) return;
    const url = resultMediaUrl(result);
    if (!url) return;
    onSaveResultToSelection({
      id: `apiai-${Date.now()}`,
      name: result.filename,
      mimeType: result.contentType,
      kind: "image",
      thumbnailUrl: url,
      previewUrl: url,
      sourceAccountId: "apiai",
      sourceAccountName: "apiai.me",
    }, { toolName: selectedTool?.name });
  }

  const resultUrl = result ? resultMediaUrl(result) : null;

  const canRun = Boolean(
    businessProfileId &&
      selectedTool &&
      !running &&
      (!needsImage || usableAssets.length > 0) &&
      (!requiresPrompt || prompt.trim())
  );

  return (
    <div className="space-y-4">
      <ApiaiStatusBar businessProfileId={businessProfileId} />

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/20 p-1">
        {(
          [
            { id: "generate", label: "Generate" },
            { id: "transform", label: "Transform" },
            { id: "batch", label: "Batch" },
          ] as const
        ).map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => setCreateMode(mode.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              createMode === mode.id
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {createMode === "generate" ? (
        <ContentAiImageCard
          businessProfileId={businessProfileId}
          captionHint={captionHint}
          canvaConnected={canvaConnected}
          onGenerated={(asset) => onRecordGenerated?.(asset)}
          onContinueToPublish={onContinueToPublish}
        />
      ) : null}

      {createMode === "batch" ? (
        <ApiaiBatchPanel
          businessProfileId={businessProfileId}
          imageAssets={batchImageAssets}
          onBeforeRequest={onBeforeRequest}
        />
      ) : null}

      {createMode === "transform" ? (
      <>
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                Create with apiai.me
              </CardTitle>
              <CardDescription>
                Use your apiai.me tools, workflows, and pipelines with the media selected in Content.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadTools()} disabled={loadingTools || !businessProfileId}>
              {loadingTools ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Reload tools
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!businessProfileId ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No active profile</AlertTitle>
              <AlertDescription>Select a business profile before loading apiai.me tools.</AlertDescription>
            </Alert>
          ) : toolsError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>apiai.me is not ready</AlertTitle>
              <AlertDescription>
                {toolsError} Add <code>APIAI_API_KEY</code> under Preferences → API keys, then reload tools.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
            <div className="space-y-3">
              <div className="space-y-2">
                <div>
                  <Label>Quick actions from apiai.me docs</Label>
                  <p className="text-xs text-muted-foreground">
                    Click a shortcut to run it instantly when images are selected, or configure it below.
                  </p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible">
                  {quickActions.map(({ action, tool }) => (
                    <button
                      key={action.id}
                      type="button"
                      disabled={!tool}
                      onClick={() => applyQuickAction(action, tool)}
                      className={`min-w-[180px] shrink-0 rounded-lg border p-3 text-left transition-colors sm:min-w-0 ${
                        tool
                          ? "border-border bg-muted/20 hover:border-primary/50 hover:bg-accent/40"
                          : "border-dashed border-border/70 bg-muted/10 opacity-70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{action.title}</span>
                        <Badge variant={tool ? "secondary" : "outline"}>{tool ? tool.type : "n/a"}</Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{action.description}</p>
                      <p className="mt-2 text-[10px] text-muted-foreground truncate">
                        <code>{tool?.endpoint || action.directEndpoint || action.docsEndpoint}</code>
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tool or pipeline</Label>
                <Select
                  value={selectedToolKey}
                  onValueChange={(value) => {
                    setToolOverride(null);
                    setSelectedToolKey(value);
                  }}
                  disabled={loadingTools || tools.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingTools ? "Loading apiai.me tools…" : "Choose a tool"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(["workflow", "pipeline", "flow"] as const).map((type) =>
                      groupedTools[type].length > 0 ? (
                        groupedTools[type].map((tool) => (
                          <SelectItem key={`${tool.type}:${tool.slug}`} value={`${tool.type}:${tool.slug}`}>
                            [{type}] {tool.name}
                          </SelectItem>
                        ))
                      ) : null
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedTool ? (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{selectedTool.type}</Badge>
                    <Badge variant="outline">Output: {outputKind(selectedTool)}</Badge>
                    {selectedTool.pricePerRequest != null ? (
                      <Badge variant="outline">${selectedTool.pricePerRequest.toFixed(3)}</Badge>
                    ) : null}
                  </div>
                  {selectedTool.description ? (
                    <p className="text-xs text-muted-foreground">{selectedTool.description}</p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground">
                    Endpoint: <code>{selectedTool.endpoint}</code>
                  </p>
                </div>
              ) : null}

              {supportsPrompt ? (
                <div className="space-y-2">
                  <Label htmlFor="apiai-prompt">Prompt{requiresPrompt ? " *" : ""}</Label>
                  <Textarea
                    id="apiai-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={4}
                    placeholder="Describe the content you want to create, transform, or evaluate…"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="apiai-output-name">Output filename</Label>
                <Input
                  id="apiai-output-name"
                  value={outputFilename}
                  onChange={(event) => setOutputFilename(event.target.value)}
                  placeholder="campaign-asset"
                />
              </div>

              {editableParams.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {editableParams.map((param) => {
                    const key = paramKey(param);
                    const allowedValues = Array.isArray(param.allowed_values)
                      ? param.allowed_values.map((value) => String(value))
                      : [];
                    return (
                      <div className="space-y-2" key={key}>
                        <Label htmlFor={`apiai-param-${key}`}>
                          {key}{param.required ? " *" : ""}
                        </Label>
                        {allowedValues.length > 0 ? (
                          <Select
                            value={paramValues[key] ?? ""}
                            onValueChange={(value) => setParamValues((current) => ({ ...current, [key]: value }))}
                          >
                            <SelectTrigger id={`apiai-param-${key}`}>
                              <SelectValue placeholder="Choose value" />
                            </SelectTrigger>
                            <SelectContent>
                              {allowedValues.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id={`apiai-param-${key}`}
                            value={paramValues[key] ?? ""}
                            onChange={(event) =>
                              setParamValues((current) => ({ ...current, [key]: event.target.value }))
                            }
                            placeholder={param.description || key}
                          />
                        )}
                        {param.description ? (
                          <p className="text-[11px] text-muted-foreground">{param.description}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <Card className="bg-muted/20 border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Input images</CardTitle>
                  <CardDescription>
                    {usableAssets.length === 0
                      ? "Select one or more images to send to apiai.me."
                      : `${usableAssets.length} usable for this tool.`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ImageAssetPicker
                    selectedAssets={selectedAssets}
                    folderAssets={availableAssets}
                    onToggle={(asset, selected) => onToggleAssetSelection?.(asset, selected)}
                    onOpenBrowse={onOpenBrowse}
                  />
                </CardContent>
              </Card>

              {selectedTool?.maxImages && usableAssets.length > selectedTool.maxImages ? (
                <p className="text-[11px] text-muted-foreground">
                  This tool accepts {selectedTool.maxImages} image{selectedTool.maxImages === 1 ? "" : "s"}; the first selected assets will be used.
                </p>
              ) : null}
              {excludedAssets.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {excludedAssets.length} selected video asset{excludedAssets.length === 1 ? "" : "s"} excluded because this tool accepts images only.
                </p>
              ) : null}

              <Button className="w-full" onClick={() => void handleRun()} disabled={!canRun}>
                {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                {running ? "Creating…" : "Run selected tool"}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void handleEstimate()}
                disabled={!selectedTool || estimating || !businessProfileId}
              >
                {estimating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Estimate cost
              </Button>
              {costEstimate?.estimate != null ? (
                <p className="text-[11px] text-muted-foreground">
                  Estimated cost: ${costEstimate.estimate.toFixed(3)}
                  {costEstimate.max != null ? ` (max $${costEstimate.max.toFixed(2)})` : ""}
                  {costEstimate.note ? ` — ${costEstimate.note}` : ""}
                </p>
              ) : null}

              {runError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Could not create content</AlertTitle>
                  <AlertDescription>{runError}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Result</CardTitle>
            <CardDescription>
              {formatHeaderValue(result.headers?.cost) ? `Cost: $${result.headers?.cost}` : "apiai.me returned a result."}
              {formatHeaderValue(result.headers?.balanceRemaining)
                ? ` Balance remaining: $${result.headers?.balanceRemaining}.`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.resultType === "binary" ? (
              <>
                {result.contentType.startsWith("image/") && resultUrl ? (
                  <img src={resultUrl} alt="Generated content" className="max-h-[520px] rounded-lg border border-border object-contain" />
                ) : result.contentType.startsWith("video/") && resultUrl ? (
                  <video src={resultUrl} controls className="max-h-[520px] rounded-lg border border-border" />
                ) : (
                  <p className="text-sm text-muted-foreground">Binary result: {result.contentType}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {resultUrl ? (
                    <Button asChild variant="outline">
                      <a href={resultUrl} download={result.filename}>
                        <Download className="h-4 w-4 mr-2" />
                        Download {result.filename}
                      </a>
                    </Button>
                  ) : null}
                  {onSaveResultToSelection && result.contentType.startsWith("image/") ? (
                    <Button type="button" variant="secondary" onClick={saveResultToSelection}>
                      Save to selection
                    </Button>
                  ) : null}
                  {onContinueToPublish ? (
                    <Button type="button" onClick={onContinueToPublish}>
                      <Send className="h-4 w-4 mr-2" />
                      Continue to post
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                {publishInsight ? (
                  <Alert variant={publishInsight.severity === "block" ? "destructive" : "default"}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{publishInsight.label}</AlertTitle>
                    {publishInsight.detail ? <AlertDescription>{publishInsight.detail}</AlertDescription> : null}
                  </Alert>
                ) : null}
                <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </>
            )}
            {result.headers?.requestId ? (
              <p className="text-[11px] text-muted-foreground">Request ID: {result.headers.requestId}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      </>
      ) : null}
    </div>
  );
}
