import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, Image as ImageIcon, Loader2, RefreshCw, Wand2 } from "lucide-react";
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
import {
  listApiaiTools,
  runApiaiTool,
  type ApiaiParam,
  type ApiaiRunResult,
  type ApiaiTool,
} from "./apiaiClient";

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
  onOpenBrowse,
  onBeforeRequest,
}: {
  businessProfileId: string | null;
  selectedAssets: SelectedContentAsset[];
  onOpenBrowse: () => void;
  onBeforeRequest?: () => Promise<void>;
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

  const selectedTool = useMemo(
    () => tools.find((tool) => `${tool.type}:${tool.slug}` === selectedToolKey) ?? null,
    [tools, selectedToolKey]
  );

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
  }, [selectedTool, editableParams]);

  async function handleRun() {
    if (!businessProfileId || !selectedTool) return;
    if (needsImage && usableAssets.length === 0) {
      setRunError("This tool needs an image. Select one or more images in Browse first.");
      return;
    }
    if (requiresPrompt && !prompt.trim()) {
      setRunError("This tool requires a prompt.");
      return;
    }

    setRunning(true);
    setRunError(null);
    setResult(null);
    try {
      await onBeforeRequest?.();
      const maxAssets = Math.max(1, Number(selectedTool.maxImages || 1));
      const nextResult = await runApiaiTool({
        businessProfileId,
        tool: selectedTool,
        prompt,
        params: paramValues,
        assets: usableAssets.slice(0, maxAssets),
        outputFilename,
      });
      setResult(nextResult);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "apiai.me generation failed.");
    } finally {
      setRunning(false);
    }
  }

  const canRun = Boolean(
    businessProfileId &&
      selectedTool &&
      !running &&
      (!needsImage || usableAssets.length > 0) &&
      (!requiresPrompt || prompt.trim())
  );

  return (
    <div className="space-y-4">
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
                <Label>Tool or pipeline</Label>
                <Select value={selectedToolKey} onValueChange={setSelectedToolKey} disabled={loadingTools || tools.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingTools ? "Loading apiai.me tools…" : "Choose a tool"} />
                  </SelectTrigger>
                  <SelectContent>
                    {tools.map((tool) => (
                      <SelectItem key={`${tool.type}:${tool.slug}`} value={`${tool.type}:${tool.slug}`}>
                        {tool.name} · {tool.type}
                      </SelectItem>
                    ))}
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
                  <CardTitle className="text-sm">Selected input</CardTitle>
                  <CardDescription>
                    {selectedAssets.length === 0
                      ? "No media selected yet."
                      : `${usableAssets.length} usable asset${usableAssets.length === 1 ? "" : "s"} for this tool.`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedAssets.length === 0 ? (
                    <Button variant="outline" size="sm" onClick={onOpenBrowse}>
                      Select media in Browse
                    </Button>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {usableAssets.map((asset) => (
                        <div key={`${asset.sourceAccountId}:${asset.id}`} className="flex items-center gap-2 text-xs">
                          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{asset.name}</span>
                          <Badge variant="outline" className="ml-auto shrink-0">
                            {asset.kind}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
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
                </CardContent>
              </Card>

              <Button className="w-full" onClick={() => void handleRun()} disabled={!canRun}>
                {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                {running ? "Creating…" : "Run selected tool"}
              </Button>

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
                {result.contentType.startsWith("image/") ? (
                  <img src={result.dataUrl} alt="Generated content" className="max-h-[520px] rounded-lg border border-border object-contain" />
                ) : result.contentType.startsWith("video/") ? (
                  <video src={result.dataUrl} controls className="max-h-[520px] rounded-lg border border-border" />
                ) : (
                  <p className="text-sm text-muted-foreground">Binary result: {result.contentType}</p>
                )}
                <Button asChild variant="outline">
                  <a href={result.dataUrl} download={result.filename}>
                    <Download className="h-4 w-4 mr-2" />
                    Download {result.filename}
                  </a>
                </Button>
              </>
            ) : (
              <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            )}
            {result.headers?.requestId ? (
              <p className="text-[11px] text-muted-foreground">Request ID: {result.headers.requestId}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
