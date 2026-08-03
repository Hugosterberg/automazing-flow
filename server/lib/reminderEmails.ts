/**
 * Focused reminder emails for lead follow-ups and task due dates.
 */

import { escapeHtml } from "./htmlEscape.ts";

export interface LeadReminderInput {
  businessName: string;
  appUrl?: string;
  overdue: Array<{ name: string; status: string }>;
  dueToday: Array<{ name: string; status: string }>;
}

export interface TaskReminderInput {
  businessName: string;
  appUrl?: string;
  overdue: Array<{ title: string }>;
  dueToday: Array<{ title: string }>;
}

export interface ReminderEmail {
  hasContent: boolean;
  subject: string;
  html: string;
  text: string;
}

function listHtml(items: string[]): string {
  if (items.length === 0) return "";
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

function renderReminder(
  businessName: string,
  appUrl: string | undefined,
  subject: string,
  sections: Array<{ heading: string; items: string[] }>,
  path: string
): ReminderEmail {
  const hasContent = sections.some((s) => s.items.length > 0);
  if (!hasContent) {
    return { hasContent: false, subject: "", html: "", text: "" };
  }
  const link = appUrl ? `<p><a href="${escapeHtml(appUrl)}${path}">Öppna i appen</a></p>` : "";
  const htmlSections = sections
    .filter((s) => s.items.length > 0)
    .map((s) => `<h3>${escapeHtml(s.heading)}</h3>${listHtml(s.items)}`)
    .join("");
  const textSections = sections
    .filter((s) => s.items.length > 0)
    .map((s) => `${s.heading}\n${s.items.map((i) => `- ${i}`).join("\n")}`)
    .join("\n\n");
  return {
    hasContent: true,
    subject,
    html: `<p>Hej ${escapeHtml(businessName)},</p>${htmlSections}${link}`,
    text: `Hej ${businessName},\n\n${textSections}${appUrl ? `\n\n${appUrl}${path}` : ""}`,
  };
}

export function buildLeadReminder(input: LeadReminderInput): ReminderEmail {
  return renderReminder(
    input.businessName,
    input.appUrl,
    `Leads att följa upp — ${input.businessName}`,
    [
      {
        heading: "Försenade uppföljningar",
        items: input.overdue.map((l) => `${l.name} (${l.status})`),
      },
      {
        heading: "Uppföljning idag",
        items: input.dueToday.map((l) => `${l.name} (${l.status})`),
      },
    ],
    "/sales"
  );
}

export function buildTaskReminder(input: TaskReminderInput): ReminderEmail {
  return renderReminder(
    input.businessName,
    input.appUrl,
    `Uppgifter att göra — ${input.businessName}`,
    [
      { heading: "Försenade uppgifter", items: input.overdue.map((t) => t.title) },
      { heading: "Klart idag", items: input.dueToday.map((t) => t.title) },
    ],
    "/tasks"
  );
}
