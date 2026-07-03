/**
 * Business health score — one 0–100 number summarising how much in the
 * workspace currently needs attention. Derived ONLY from signals the home
 * dashboard already loads (no extra fetches):
 *
 *   - connection issues  (broken integrations block every downstream flow)
 *   - overdue tasks      (commitments already missed)
 *   - due-today tasks    (light pressure, small deduction)
 *   - active AI recommendations (unhandled opportunities, lightest weight)
 *
 * The exact weights are a product choice, not science — they are tuned so a
 * single broken connection reads as a real problem (-18) while a handful of
 * open recommendations only nudges the score.
 */

export interface BusinessHealthInput {
  connectionIssues: number;
  overdueTasks: number;
  dueTodayTasks: number;
  activeRecommendations: number;
  unreadMessages?: number;
  leadsToFollowUp?: number;
  reviewsNeedingReply?: number;
}

export type BusinessHealthTone = "success" | "info" | "warning";

export interface BusinessHealthResult {
  /** 0–100, higher is healthier. */
  score: number;
  /** Short human label for the bucket the score falls in. */
  label: string;
  /** Maps to the dashboard tile tones. */
  tone: BusinessHealthTone;
  /** The single most important reason behind a non-perfect score. */
  topReason: string | null;
}

function clampDeduction(value: number, per: number, max: number): number {
  return Math.min(max, Math.max(0, value) * per);
}

export function computeBusinessHealth(input: BusinessHealthInput): BusinessHealthResult {
  const connectionPenalty = clampDeduction(input.connectionIssues, 18, 36);
  const overduePenalty = clampDeduction(input.overdueTasks, 8, 32);
  const dueTodayPenalty = clampDeduction(input.dueTodayTasks, 2, 8);
  const recommendationPenalty = clampDeduction(input.activeRecommendations, 1.5, 9);
  const unreadPenalty = clampDeduction(input.unreadMessages ?? 0, 3, 12);
  const leadsPenalty = clampDeduction(input.leadsToFollowUp ?? 0, 4, 16);
  const reviewsPenalty = clampDeduction(input.reviewsNeedingReply ?? 0, 3, 9);

  const score = Math.max(
    0,
    Math.round(
      100 -
        connectionPenalty -
        overduePenalty -
        dueTodayPenalty -
        recommendationPenalty -
        unreadPenalty -
        leadsPenalty -
        reviewsPenalty
    )
  );

  // Reasons ordered by severity of their penalty so the hint always points
  // at the biggest lever first.
  const reasons: Array<{ penalty: number; text: string }> = [
    {
      penalty: connectionPenalty,
      text:
        input.connectionIssues === 1
          ? "1 connection needs attention"
          : `${input.connectionIssues} connections need attention`,
    },
    {
      penalty: overduePenalty,
      text:
        input.overdueTasks === 1
          ? "1 overdue task"
          : `${input.overdueTasks} overdue tasks`,
    },
    {
      penalty: dueTodayPenalty,
      text:
        input.dueTodayTasks === 1
          ? "1 task due today"
          : `${input.dueTodayTasks} tasks due today`,
    },
    {
      penalty: recommendationPenalty,
      text:
        input.activeRecommendations === 1
          ? "1 open AI recommendation"
          : `${input.activeRecommendations} open AI recommendations`,
    },
    {
      penalty: unreadPenalty,
      text:
        (input.unreadMessages ?? 0) === 1
          ? "1 unread message"
          : `${input.unreadMessages ?? 0} unread messages`,
    },
    {
      penalty: leadsPenalty,
      text:
        (input.leadsToFollowUp ?? 0) === 1
          ? "1 lead to follow up"
          : `${input.leadsToFollowUp ?? 0} leads to follow up`,
    },
    {
      penalty: reviewsPenalty,
      text:
        (input.reviewsNeedingReply ?? 0) === 1
          ? "1 review needs a reply"
          : `${input.reviewsNeedingReply ?? 0} reviews need replies`,
    },
  ];
  const topReason =
    reasons
      .filter((r) => r.penalty > 0)
      .sort((a, b) => b.penalty - a.penalty)[0]?.text ?? null;

  if (score >= 90) {
    return { score, label: "Excellent", tone: "success", topReason };
  }
  if (score >= 70) {
    return { score, label: "Good", tone: "info", topReason };
  }
  return { score, label: "Needs attention", tone: "warning", topReason };
}
