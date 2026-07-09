import { useEffect, useRef, useState } from "react";
import { Download, FolderOpen, History, Layers, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelectedContentAsset } from "@/lib/contentSelection";
import { apiUrl } from "@/lib/apiBase";
import {
  createApiaiBatch,
  getApiaiBatch,
  ingestApiaiBatch,
  listApiaiBatches,
  type ApiaiBatchIngestItem,
  type ApiaiBatchJob,
  type ApiaiBatchSummary,
} from "./apiaiClient";
import { batchStatusLabel, isBatchComplete, isBatchTerminal } from "./apiaiBatchUtils";
import { readLastBatchWorkflow, writeLastBatchWorkflow } from "./contentAutomationPrefs";

export function ApiaiBatchPanel({
  businessProfileId,
  imageAssets,
  workflowOptions = [],
  onBeforeRequest,
  onOpenBrowse,
  onOpenSelected,
  onOpenHistory,
  onBatchIngested,
}: {
  businessProfileId: string | null;
  imageAssets: SelectedContentAsset[];
  workflowOptions?: { value: string; label: string }[];
  onBeforeRequest?: () => Promise<void>;
  onOpenBrowse?: () => void;
  onOpenSelected?: () => void;
  onOpenHistory?: () => void;
  onBatchIngested?: (
    items: ApiaiBatchIngestItem[],
    meta: { batchId: number; workflow?: string; addToSelection: boolean }
  ) => void;
}) {
  const [workflow, setWorkflow] = useState(() => readLastBatchWorkflow());
  const [creating, setCreating] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [addToSelection, setAddToSelection] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ApiaiBatchSummary[]>([]);
  const [activeJob, setActiveJob] = useState<ApiaiBatchJob | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const ingestedRef = useRef<number | null>(null);

  async function refreshJobs() {
    if (!businessProfileId) return;
    setLoadingJobs(true);
    try {
      await onBeforeRequest?.();
      const next = await listApiaiBatches(businessProfileId);
      setJobs(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load batch jobs");
    } finally {
      setLoadingJobs(false);
    }
  }

  useEffect(() => {
    void refreshJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessProfileId]);

  async function handleCreate() {
    if (!businessProfileId || imageAssets.length === 0) return;
    setCreating(true);
    setError(null);
    setImportedCount(null);
    ingestedRef.current = null;
    try {
      await onBeforeRequest?.();
      const created = await createApiaiBatch({
        businessProfileId,
        workflow: workflow.trim(),
        assets: imageAssets,
      });
      setActiveJob(created);
      await refreshJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start batch job");
    } finally {
      setCreating(false);
    }
  }

  async function refreshActiveJob(id: number) {
    if (!businessProfileId) return;
    try {
      const job = await getApiaiBatch(businessProfileId, id);
      setActiveJob(job);
    } catch {
      // Best effort.
    }
  }

  async function ingestCompletedJob(job: ApiaiBatchJob) {
    if (!businessProfileId || ingestedRef.current === job.id) return;
    ingestedRef.current = job.id;
    setIngesting(true);
    setError(null);
    try {
      await onBeforeRequest?.();
      const result = await ingestApiaiBatch(businessProfileId, job.id);
      onBatchIngested?.(result.items, {
        batchId: job.id,
        workflow: job.workflow,
        addToSelection,
      });
      setImportedCount(result.items.length);
      toast.success(
        `${result.items.length} image${result.items.length === 1 ? "" : "s"} saved to History${
          addToSelection ? " and selection" : ""
        }`
      );
    } catch (e) {
      ingestedRef.current = null;
      setError(e instanceof Error ? e.message : "Could not import batch results");
      toast.error(e instanceof Error ? e.message : "Could not import batch results");
    } finally {
      setIngesting(false);
    }
  }

  useEffect(() => {
    if (!activeJob?.id || !businessProfileId) return;
    if (isBatchComplete(String(activeJob.status || ""))) {
      if (ingestedRef.current !== activeJob.id && !ingesting) {
        void ingestCompletedJob(activeJob);
      }
      return;
    }
    if (isBatchTerminal(String(activeJob.status || ""))) return;

    const timer = window.setInterval(() => {
      void refreshActiveJob(activeJob.id);
    }, 3000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.id, activeJob?.status, businessProfileId, addToSelection]);

  return (
    <Card className="bg-muted/10 border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Batch process images
            </CardTitle>
            <CardDescription>
              Run the same apiai.me workflow on all selected images — results import to History automatically.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void refreshJobs()} disabled={loadingJobs}>
            {loadingJobs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!businessProfileId ? (
          <p className="text-sm text-muted-foreground">Select a business profile to run batch jobs.</p>
        ) : null}
        {imageAssets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Add images to Selected first — batch runs on your current picks.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {onOpenSelected ? (
                <Button type="button" size="sm" variant="default" onClick={onOpenSelected}>
                  Open Selected
                </Button>
              ) : null}
              {onOpenBrowse ? (
                <Button type="button" size="sm" variant="outline" onClick={onOpenBrowse}>
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                  Browse Drive
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {imageAssets.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Input images ({imageAssets.length})</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {imageAssets.map((asset) => (
                <div
                  key={`${asset.sourceAccountId}:${asset.id}`}
                  className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted/30"
                >
                  <img
                    src={asset.thumbnailUrl || asset.previewUrl}
                    alt={asset.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Checkbox
            id="batch-add-selection"
            checked={addToSelection}
            onCheckedChange={(checked) => setAddToSelection(checked === true)}
          />
          <Label htmlFor="batch-add-selection" className="text-xs font-normal cursor-pointer">
            Add imported images to Selected
          </Label>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-1">
            <Label htmlFor="apiai-batch-workflow">Workflow</Label>
            {workflowOptions.length > 0 ? (
              <Select
                value={workflow}
                onValueChange={(value) => {
                  setWorkflow(value);
                  writeLastBatchWorkflow(value);
                }}
              >
                <SelectTrigger id="apiai-batch-workflow">
                  <SelectValue placeholder="Pick workflow" />
                </SelectTrigger>
                <SelectContent>
                  {workflowOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="apiai-batch-workflow"
                value={workflow}
                onChange={(event) => {
                  const next = event.target.value;
                  setWorkflow(next);
                  writeLastBatchWorkflow(next);
                }}
                placeholder="remove-bg or flow:my-pipeline"
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              {workflowOptions.length > 0
                ? "Pick from your apiai.me tools, or type a custom slug below."
                : "Use flow:slug for pipelines."}
            </p>
            <Input
              aria-label="Custom workflow slug"
              value={workflow}
              onChange={(event) => {
                const next = event.target.value;
                setWorkflow(next);
                writeLastBatchWorkflow(next);
              }}
              placeholder="Custom slug override"
              className="h-8 text-xs"
            />
          </div>
          <Button
            className="self-end"
            onClick={() => void handleCreate()}
            disabled={creating || ingesting || !businessProfileId || imageAssets.length === 0 || !workflow.trim()}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Start batch
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {activeJob ? (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Job #{activeJob.id}</span>
              <Badge variant="secondary">{batchStatusLabel(String(activeJob.status || "unknown"))}</Badge>
              {activeJob.total_items != null ? (
                <span className="text-xs text-muted-foreground">{activeJob.completed_items ?? 0}/{activeJob.total_items} done</span>
              ) : null}
              {ingesting ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Importing…
                </span>
              ) : null}
              {importedCount != null ? (
                <span className="text-xs text-primary">{importedCount} in History</span>
              ) : null}
              <Button variant="ghost" size="sm" className="h-7 px-2 ml-auto" onClick={() => void refreshActiveJob(activeJob.id)}>
                Refresh
              </Button>
              {isBatchComplete(String(activeJob.status || "")) ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    disabled={ingesting}
                    onClick={() => {
                      ingestedRef.current = null;
                      void ingestCompletedJob(activeJob);
                    }}
                  >
                    Re-import
                  </Button>
                  {onOpenHistory ? (
                    <Button variant="outline" size="sm" className="h-7" onClick={onOpenHistory}>
                      <History className="h-3.5 w-3.5 mr-1" />
                      History
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm" className="h-7">
                    <a href={apiUrl(`/api/apiai/batch/${activeJob.id}/download?business_profile_id=${encodeURIComponent(businessProfileId || "")}`)}>
                      <Download className="h-3.5 w-3.5 mr-1" />
                      ZIP
                    </a>
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {jobs.length > 0 ? (
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Recent batches</p>
            {jobs.slice(0, 5).map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => {
                  setImportedCount(null);
                  ingestedRef.current = null;
                  void refreshActiveJob(job.id);
                }}
                className="w-full flex items-center justify-between rounded-md border border-border/70 px-2.5 py-1.5 text-left text-xs hover:bg-accent/40"
              >
                <span>#{job.id} · {job.workflow || "workflow"}</span>
                <Badge variant="outline">{batchStatusLabel(String(job.status || ""))}</Badge>
              </button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
