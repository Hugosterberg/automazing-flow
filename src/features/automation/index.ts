export { AutomationPanel } from "./AutomationPanel";
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
