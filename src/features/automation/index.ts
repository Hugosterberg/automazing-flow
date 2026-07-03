export { AutomationPanel } from "./AutomationPanel";
export { AutomatedUpdatesCard } from "./AutomatedUpdatesCard";
export { AutomationRunStatus } from "./AutomationRunStatus";
export { useAutomationRuns } from "./useAutomationRuns";
export type { AutomationRunsState } from "./useAutomationRuns";
export {
  AUTOMATION_TOPICS,
  AUTOMATION_TOPIC_ORDER,
  automationCatalog,
  catalogEntriesForTopic,
} from "./automationCatalog";
export type {
  AutomationTopic,
  AutomationTopicInfo,
  AutomationCatalogEntry,
} from "./automationCatalog";
export {
  fetchAutomationSettings,
  saveAutomationSettings,
  fetchAutoReplyLog,
  fetchAutomationRuns,
  runAutomationNow,
  sendAutomationDraft,
} from "./automationService";
export type {
  AutomationSettings,
  AutoReplyLogEntry,
  AutoReplyRunSummary,
  AutomationLastRun,
  AutomationRunStatus as AutomationRunStatusData,
} from "./automationService";
