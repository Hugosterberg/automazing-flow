/**
 * Maps activity event subjects to in-app deep links so the feed is a
 * launchpad, not a dead-end log viewer.
 */
export function resolveActivitySubjectLink(
  subjectType: string | null | undefined,
  subjectId: string | null | undefined
): { to: string; label: string } | null {
  if (!subjectType || !subjectId) return null;
  const type = subjectType.toLowerCase().replace(/-/g, "_");

  if (type === "task" || type === "tasks") {
    return { to: `/tasks?task=${encodeURIComponent(subjectId)}`, label: "Öppna uppgift" };
  }
  if (type === "lead" || type === "leads") {
    return { to: `/sales?lead=${encodeURIComponent(subjectId)}`, label: "Öppna lead" };
  }
  if (type === "connected_account" || type === "account" || type === "connection") {
    return { to: "/connections", label: "Öppna kopplingar" };
  }
  if (type === "ai_recommendation" || type === "recommendation") {
    return { to: "/ai-recommendations", label: "AI-rekommendationer" };
  }
  if (type === "message" || type === "email" || type === "conversation") {
    return { to: `/messages?id=${encodeURIComponent(subjectId)}`, label: "Öppna meddelande" };
  }
  if (type === "review") {
    return { to: "/reviews", label: "Öppna recensioner" };
  }
  if (type === "campaign" || type === "marketing_campaign") {
    return { to: "/marketing", label: "Öppna marketing" };
  }
  if (type === "product") {
    return { to: "/ecommerce?tab=products", label: "Öppna produkt" };
  }
  if (type === "scheduled_post" || type === "post") {
    return { to: "/social-media", label: "Öppna social" };
  }
  return null;
}
