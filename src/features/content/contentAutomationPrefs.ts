const BATCH_WORKFLOW_KEY = "automazing-batch-workflow";

export function readLastBatchWorkflow(): string {
  try {
    return sessionStorage.getItem(BATCH_WORKFLOW_KEY) || "remove-bg";
  } catch {
    return "remove-bg";
  }
}

export function writeLastBatchWorkflow(workflow: string) {
  try {
    const trimmed = workflow.trim();
    if (trimmed) sessionStorage.setItem(BATCH_WORKFLOW_KEY, trimmed);
  } catch {
    // ignore
  }
}

export function assetFingerprint(assets: Array<{ id: string; previewUrl?: string; thumbnailUrl?: string }>): string {
  return assets.map((asset) => asset.previewUrl || asset.thumbnailUrl || asset.id).join("|");
}
