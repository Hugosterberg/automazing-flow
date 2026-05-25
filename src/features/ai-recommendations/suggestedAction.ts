/**
 * Helpers for interpreting the `suggested_action` JSON field on an
 * `ai_recommendations` row.
 *
 * The field is free-form `jsonb` in the schema so the producer (and
 * eventually an LLM) can emit new action shapes over time. This module
 * defines the small subset of shapes the UI currently understands and
 * guards against malicious values (e.g. protocol-relative URLs, api
 * paths the user shouldn't land on).
 *
 * Contract today:
 *   { type: "navigate", to: "/some/path" }
 *
 * Future shapes we might add (not yet implemented):
 *   { type: "external", url: "https://..." }
 *   { type: "open_modal", modal: "create_task", params: {...} }
 */

/**
 * Routes the UI may deep-link into when a recommendation is accepted.
 * Kept in sync with `src/App.tsx` — anything not on this list is rejected
 * so a bad producer can't redirect the user into `/api/...` or an
 * unrecognised path.
 */
const ALLOWED_INTERNAL_ROUTES = new Set<string>([
  "/",
  "/social-media",
  "/ecommerce",
  "/sales",
  "/marketing",
  "/sales-marketing",
  "/customers",
  "/calendar",
  "/messages",
  "/reviews",
  "/content",
  "/tasks",
  "/activity",
  "/ai-recommendations",
  "/preferences",
  "/connections",
  "/integrations",
]);

/**
 * Extract a safe internal route from a `suggested_action` JSON value.
 * Returns `null` when the value is missing, malformed, points at an
 * unrecognised path, or uses a non-navigate shape.
 */
export function resolveNavigateTarget(action: unknown): string | null {
  if (!action || typeof action !== "object") return null;
  const obj = action as Record<string, unknown>;
  if (obj.type !== "navigate") return null;

  const to = obj.to;
  if (typeof to !== "string") return null;

  const trimmed = to.trim();
  // Reject protocol-relative (`//evil.com`) and external URLs outright.
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;

  // Strip hash/query for the whitelist check so `/tasks?filter=open` resolves.
  const pathOnly = trimmed.split(/[?#]/)[0];
  if (!ALLOWED_INTERNAL_ROUTES.has(pathOnly)) return null;

  return trimmed;
}
