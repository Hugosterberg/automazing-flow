export { AutomationPanel } from "./AutomationPanel";
export { AutomatedUpdatesCard } from "./AutomatedUpdatesCard";
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
  runAutomationNow,
  sendAutomationDraft,
} from "./automationService";
export type {
  AutomationSettings,
  AutoReplyLogEntry,
  AutoReplyRunSummary,
} from "./automationService";
