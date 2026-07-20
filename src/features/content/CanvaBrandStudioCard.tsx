import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AlertCircle, Check, ExternalLink, FolderPlus, Loader2, Palette, RefreshCw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProfileDocument } from "@/features/profile-documents";
import type { SelectedContentAsset } from "@/lib/contentSelection";
import {
  generateCanvaBrandBatch,
  listCanvaBrandTemplates,
  type CanvaBrandGenerateResult,
  type CanvaBrandTemplateSummary,
} from "./contentMediaClient";
import {
  CANVA_BRAND_KIT_DOC_KEY,
  DEFAULT_BRAND_KIT,
  POST_FORMAT_OPTIONS,
  defaultMaxHeadlineChars,
  type CanvaBrandKit,
  type CanvaPostFormat,
  type CanvaTextSize,
} from "./canvaBrandKit";

const TEXT_SIZE_OPTIONS: CanvaTextSize[] = ["small", "medium", "large"];
const COUNT_OPTIONS = [2, 3, 4, 5, 6];

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 font-mono text-xs"
          maxLength={7}
        />
      </div>
    </div>
  );
}

export function CanvaBrandStudioCard({
  businessProfileId,
  canvaConnected = false,
  onRecordGenerated,
  onSaveResultToSelection,
  onContinueToPublish,
}: {
  businessProfileId: string | null;
  canvaConnected?: boolean;
  onRecordGenerated?: (asset: SelectedContentAsset, meta?: { toolName?: string }) => void;
  onSaveResultToSelection?: (asset: SelectedContentAsset, meta?: { toolName?: string }) => void;
  onContinueToPublish?: () => void;
}) {
  const { t } = useTranslation("content");

  const kitDoc = useProfileDocument<CanvaBrandKit>(CANVA_BRAND_KIT_DOC_KEY, DEFAULT_BRAND_KIT);
  const kit = kitDoc.data;

  function updateKit(patch: Partial<CanvaBrandKit>) {
    kitDoc.save({ ...kit, ...patch });
  }

  const recommendedMaxChars = defaultMaxHeadlineChars(kit.textSize, kit.format);

  const [templates, setTemplates] = useState<CanvaBrandTemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateQuery, setTemplateQuery] = useState("");

  const [count, setCount] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [results, setResults] = useState<CanvaBrandGenerateResult[]>([]);
  const [addedDesignIds, setAddedDesignIds] = useState<Set<string>>(new Set());

  const selectedTemplateId = kit.brandTemplateIds[kit.format];

  async function loadTemplates(query?: string) {
    if (!canvaConnected) return;
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const { items } = await listCanvaBrandTemplates({ businessProfileId, query });
      setTemplates(items);
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : t("brandStudio.templatesLoadFailed"));
    } finally {
      setTemplatesLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvaConnected, businessProfileId]);

  const formatLabel = (format: CanvaPostFormat) => {
    const ratio = POST_FORMAT_OPTIONS.find((option) => option.value === format)?.ratio ?? "";
    return `${t(`brandStudio.formats.${format}`)} (${ratio})`;
  };

  async function handleGenerate() {
    if (!selectedTemplateId) {
      setGenerateError(t("brandStudio.templateRequired"));
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    setResults([]);
    setAddedDesignIds(new Set());
    try {
      const response = await generateCanvaBrandBatch({
        businessProfileId,
        brandTemplateId: selectedTemplateId,
        count,
        businessName: kit.label || undefined,
        toneOfVoice: kit.toneOfVoice || undefined,
        topics: kit.topics || undefined,
        maxHeadlineChars: kit.maxHeadlineChars,
      });
      setResults(response.results);
      response.results.forEach((result) => onRecordGenerated?.(resultToAsset(result), { toolName: "Canva Brand Studio" }));
      if (response.errors?.length) {
        toast.message(t("brandStudio.partialFailure", { count: response.errors.length }));
      }
      toast.success(t("brandStudio.generatedCount", { count: response.results.length }));
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : t("brandStudio.generateFailed"));
    } finally {
      setGenerating(false);
    }
  }

  function resultToAsset(result: CanvaBrandGenerateResult): SelectedContentAsset {
    return {
      id: `canva-brand-${result.designId}`,
      name: `${result.title.slice(0, 60) || "canva-brand-post"}.png`,
      mimeType: "image/png",
      kind: "image",
      thumbnailUrl: result.imageUrl,
      previewUrl: result.imageUrl,
      sourceAccountId: "canva",
      sourceAccountName: kit.label ? `Canva — ${kit.label}` : "Canva",
    };
  }

  function handleAddResult(result: CanvaBrandGenerateResult) {
    onSaveResultToSelection?.(resultToAsset(result), { toolName: "Canva Brand Studio" });
    setAddedDesignIds((current) => new Set(current).add(result.designId));
    toast.success(t("brandStudio.addedToSelection"));
  }

  const anyAdded = addedDesignIds.size > 0;

  if (!canvaConnected) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            {t("brandStudio.title")}
          </CardTitle>
          <CardDescription>{t("brandStudio.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span>{t("brandStudio.canvaNotConnected")}</span>
            <Button variant="link" size="sm" className="h-auto px-0 py-0 text-xs" asChild>
              <Link to="/connections">{t("brandStudio.connectCanva")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          {t("brandStudio.title")}
        </CardTitle>
        <CardDescription>{t("brandStudio.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="brand-kit-label">{t("brandStudio.labelField")}</Label>
            <Input
              id="brand-kit-label"
              value={kit.label}
              onChange={(event) => updateKit({ label: event.target.value })}
              placeholder={t("brandStudio.labelPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("brandStudio.fontField")}</Label>
            <Input
              value={kit.fontFamily}
              onChange={(event) => updateKit({ fontFamily: event.target.value })}
              placeholder={t("brandStudio.fontPlaceholder")}
            />
            <p className="text-[11px] text-muted-foreground">{t("brandStudio.fontHint")}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <ColorField label={t("brandStudio.colorPrimary")} value={kit.colors.primary} onChange={(value) => updateKit({ colors: { ...kit.colors, primary: value } })} />
          <ColorField label={t("brandStudio.colorSecondary")} value={kit.colors.secondary} onChange={(value) => updateKit({ colors: { ...kit.colors, secondary: value } })} />
          <ColorField label={t("brandStudio.colorAccent")} value={kit.colors.accent} onChange={(value) => updateKit({ colors: { ...kit.colors, accent: value } })} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>{t("brandStudio.formatField")}</Label>
            <Select value={kit.format} onValueChange={(value) => updateKit({ format: value as CanvaPostFormat })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POST_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {formatLabel(option.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("brandStudio.textSizeField")}</Label>
            <Select value={kit.textSize} onValueChange={(value) => updateKit({ textSize: value as CanvaTextSize })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEXT_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={size}>
                    {t(`brandStudio.textSizes.${size}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-kit-max-chars">{t("brandStudio.maxCharsField")}</Label>
            <Input
              id="brand-kit-max-chars"
              type="number"
              min={10}
              max={400}
              value={kit.maxHeadlineChars}
              onChange={(event) => updateKit({ maxHeadlineChars: Math.max(10, Number(event.target.value) || recommendedMaxChars) })}
            />
            {kit.maxHeadlineChars !== recommendedMaxChars ? (
              <button
                type="button"
                onClick={() => updateKit({ maxHeadlineChars: recommendedMaxChars })}
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {t("brandStudio.useRecommended", { count: recommendedMaxChars })}
              </button>
            ) : (
              <p className="text-[11px] text-muted-foreground">{t("brandStudio.maxCharsHint")}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("brandStudio.toneField")}</Label>
            <Textarea
              rows={2}
              value={kit.toneOfVoice}
              onChange={(event) => updateKit({ toneOfVoice: event.target.value })}
              placeholder={t("brandStudio.tonePlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("brandStudio.topicsField")}</Label>
            <Textarea
              rows={2}
              value={kit.topics}
              onChange={(event) => updateKit({ topics: event.target.value })}
              placeholder={t("brandStudio.topicsPlaceholder")}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>{t("brandStudio.templateField", { format: formatLabel(kit.format) })}</Label>
            <div className="flex items-center gap-2">
              <Input
                value={templateQuery}
                onChange={(event) => setTemplateQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loadTemplates(templateQuery);
                }}
                placeholder={t("brandStudio.templateSearchPlaceholder")}
                className="h-8 w-48 text-xs"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => void loadTemplates(templateQuery)} disabled={templatesLoading}>
                {templatesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {templatesError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t("brandStudio.templatesLoadFailedTitle")}</AlertTitle>
              <AlertDescription>{templatesError}</AlertDescription>
            </Alert>
          ) : templatesLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("brandStudio.templatesLoading")}
            </div>
          ) : templates.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t("brandStudio.noTemplates")}</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {templates.map((template) => {
                const selected = template.id === selectedTemplateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => updateKit({ brandTemplateIds: { ...kit.brandTemplateIds, [kit.format]: template.id } })}
                    className={`relative w-32 shrink-0 rounded-lg border overflow-hidden text-left transition-colors ${
                      selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="aspect-square bg-muted/30 flex items-center justify-center">
                      {template.thumbnailUrl ? (
                        <img src={template.thumbnailUrl} alt={template.title} className="h-full w-full object-cover" />
                      ) : (
                        <Palette className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    {selected ? (
                      <span className="absolute top-1 right-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                    <p className="truncate px-1.5 py-1 text-[11px]">{template.title}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border/80 bg-secondary/20 p-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("brandStudio.countField")}</Label>
            <Select value={String(count)} onValueChange={(value) => setCount(Number(value))}>
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNT_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={() => void handleGenerate()} disabled={generating || !selectedTemplateId} className="ml-auto">
            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {generating ? t("brandStudio.generating") : t("brandStudio.generate", { count })}
          </Button>
        </div>

        {generateError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t("brandStudio.generateFailedTitle")}</AlertTitle>
            <AlertDescription>{generateError}</AlertDescription>
          </Alert>
        ) : null}

        {results.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{t("brandStudio.resultsCount", { count: results.length })}</p>
              {anyAdded && onContinueToPublish ? (
                <Button type="button" size="sm" onClick={onContinueToPublish}>
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {t("create.continueToPublish")}
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {results.map((result) => {
                const added = addedDesignIds.has(result.designId);
                return (
                  <Card key={result.designId} className="overflow-hidden border-border">
                    <div className="aspect-square bg-muted/30">
                      <img src={result.imageUrl} alt={result.title} className="h-full w-full object-cover" loading="lazy" />
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs font-medium truncate" title={result.title}>{result.title}</p>
                      {result.format ? <Badge variant="outline" className="text-[10px]">{result.format}</Badge> : null}
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          disabled={added}
                          onClick={() => handleAddResult(result)}
                        >
                          <FolderPlus className="h-3 w-3 mr-1" />
                          {added ? t("brandStudio.inSelection") : t("brandStudio.addToSelection")}
                        </Button>
                        {result.editUrl ? (
                          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
                            <a href={result.editUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              {t("brandStudio.editInCanva")}
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
