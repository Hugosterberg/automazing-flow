export const WORKSPACE_GOAL_DOC_KEY = "workspace-goal";

export type WorkspaceGoalId = "inbox" | "sales" | "content" | "ops";

export type WorkspaceGoalDoc = {
  goalId: WorkspaceGoalId;
  label: string;
  setAt: string;
};

export const WORKSPACE_GOALS: Array<{
  id: WorkspaceGoalId;
  label: string;
  detail: string;
}> = [
  {
    id: "inbox",
    label: "Hinna svara på mail och DM",
    detail: "Prioriterar Gmail/Outlook och Meddelanden i onboarding.",
  },
  {
    id: "sales",
    label: "Få fler leads och uppföljningar",
    detail: "Prioriterar Företag, Sales och outreach-utkast.",
  },
  {
    id: "content",
    label: "Publicera content regelbundet",
    detail: "Prioriterar Drive, Social och schemaläggning.",
  },
  {
    id: "ops",
    label: "Samla allt på ett ställe",
    detail: "Bred start — mail + en kanal + Hem-brief.",
  },
];

export function workspaceGoalById(id: WorkspaceGoalId | null | undefined) {
  return WORKSPACE_GOALS.find((g) => g.id === id) ?? null;
}
