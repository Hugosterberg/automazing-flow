/**
 * Auth-only weekly recap text — same story as the Monday email, for copy/print.
 * Pure helper; callers gather numbers from existing hooks.
 */

import { formatCurrency } from "@/lib/format";
import { formatRoas } from "@/features/marketing/format";

export type WeeklyResultsInput = {
  businessName: string;
  leadsWon: number;
  leadsNew: number;
  followUpsDue: number;
  tasksCompleted: number;
  successEvents: number;
  roasCurrent?: number | null;
  revenueThisWeek?: number | null;
  spendThisWeek?: number | null;
};

export type WeeklyResultsSummary = {
  hasContent: boolean;
  headline: string;
  lines: string[];
  plainText: string;
};

function formatMoney(amount: number | null | undefined): string | null {
  return formatCurrency(amount, "SEK") || null;
}

export function buildWeeklyResultsSummary(input: WeeklyResultsInput): WeeklyResultsSummary {
  const lines: string[] = [];

  if (input.roasCurrent != null && Number.isFinite(input.roasCurrent)) {
    const rev = formatMoney(input.revenueThisWeek);
    const spend = formatMoney(input.spendThisWeek);
    const detail =
      rev && spend ? ` (${rev} intäkt på ${spend} annonskostnad)` : "";
    lines.push(`ROAS ${formatRoas(input.roasCurrent)}${detail}`);
  }
  if (input.leadsWon > 0) {
    lines.push(
      input.leadsWon === 1 ? "1 lead vunnen" : `${input.leadsWon} leads vunna`
    );
  }
  if (input.leadsNew > 0) {
    lines.push(
      input.leadsNew === 1 ? "1 ny lead tillagd" : `${input.leadsNew} nya leads`
    );
  }
  if (input.tasksCompleted > 0) {
    lines.push(
      input.tasksCompleted === 1
        ? "1 uppgift klar"
        : `${input.tasksCompleted} uppgifter klara`
    );
  }
  if (input.followUpsDue > 0) {
    lines.push(
      input.followUpsDue === 1
        ? "1 uppföljning förfaller den här veckan"
        : `${input.followUpsDue} uppföljningar förfaller den här veckan`
    );
  }
  if (input.successEvents > 0) {
    lines.push(
      input.successEvents === 1
        ? "1 lyckad aktivitet i loggen"
        : `${input.successEvents} lyckade aktiviteter i loggen`
    );
  }

  const hasContent = lines.length > 0;
  const headline = hasContent
    ? `${input.businessName}: veckan i korthet`
    : `${input.businessName}: en lugn vecka`;

  const body = hasContent
    ? lines.map((l) => `• ${l}`).join("\n")
    : "Ingen utmärkande aktivitet senaste 7 dagarna — bra läge att planera leads eller content.";

  const plainText = `${headline}\n\n${body}\n\n— Delat från automazing (inloggad vy)`;

  return { hasContent, headline, lines, plainText };
}
