export type ContentTab = "browse" | "selected" | "create" | "history" | "publish";

/** Steps shown in the flow guide (History uses the create step visually). */
export type ContentFlowStep = "browse" | "selected" | "create" | "publish";

export const CONTENT_TABS: ContentTab[] = ["browse", "selected", "create", "history", "publish"];

export function isContentTab(value: string | null): value is ContentTab {
  return value === "browse" || value === "selected" || value === "create" || value === "history" || value === "publish";
}

export function flowStepFromTab(tab: ContentTab): ContentFlowStep {
  if (tab === "history") return "create";
  return tab;
}
