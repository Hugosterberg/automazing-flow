export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date YYYY-MM-DD
  time?: string; // HH:mm
  isAutomated: boolean;
  description?: string;
  createdAt: string;
}
