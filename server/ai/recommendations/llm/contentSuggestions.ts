/**
 * LLM-driven `content_suggestion` heuristic.
 *
 * Unlike the deterministic heuristics in `../heuristics.ts`, this one is
 * stochastic: two calls with the same input will produce different output.
 * Idempotency is therefore handled differently — every run expires all
 * currently active LLM-content recs for the tenant and replaces them with
 * a fresh batch. This matches the UX users expect from "generate more
 * ideas": new output supersedes old, resolved ones stay in history.
 *
 * Guard rails:
 *   - Skips silently when OPENAI_API_KEY is not configured.
 *   - Hard-caps output at 5 ideas regardless of what the model returns.
 *   - Swallows and logs network/provider errors; returns 0 on failure so
 *     the rest of the producer still completes.
 *
 * Not called from cron or reconcile — only from the manual `/api/ai-
 * recommendations/generate` endpoint. Cost control is intentional.
 */

import { chatJson, hasOpenAiKey, LlmRequestError } from "./openaiProvider.ts";

/** Dedicated `module` value so we can safely expire old LLM batches. */
export const LLM_CONTENT_MODULE = "ai_content_llm";

/** Upper bound on how many ideas we keep even if the model returns more. */
const MAX_IDEAS = 5;

/** Default when caller doesn't specify. Balance between cost and value. */
const DEFAULT_IDEAS = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder chain is intentionally untyped for brevity
type SupabaseLike = { from: (table: string) => any };

export interface LlmContentResult {
  created: number;
  expired: number;
  skipped?: "no_api_key" | "no_signal" | "provider_error" | "cached";
  error?: string;
}

/**
 * Short-lived in-memory coalescing + cooldown for LLM calls.
 *
 *   - `inflight` dedupes concurrent calls for the same business profile so
 *     rapid double-clicks never result in two OpenAI requests.
 *   - `cooldown` holds the wall-clock expiry after a SUCCESSFUL run. While
 *     the entry is fresh, repeat calls return `{ skipped: "cached" }` without
 *     touching OpenAI or the database. Failed runs are NOT cached so users
 *     can retry immediately after a transient provider error.
 *
 * Caveat: this cache lives in the Node process. On Vercel's serverless
 * runtime, a cold start or a different region will bypass the cache — that
 * is acceptable because this is a best-effort protection against rapid
 * clicks from a single browser session, not a correctness mechanism.
 */
const LLM_COOLDOWN_MS = 60_000;
const inflight = new Map<string, Promise<LlmContentResult>>();
const cooldown = new Map<string, { expiresAt: number }>();

function isCooldownActive(businessProfileId: string): boolean {
  const entry = cooldown.get(businessProfileId);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    cooldown.delete(businessProfileId);
    return false;
  }
  return true;
}

function markCooldown(businessProfileId: string): void {
  cooldown.set(businessProfileId, {
    expiresAt: Date.now() + LLM_COOLDOWN_MS,
  });
}

interface BusinessProfileRow {
  id: string;
  name: string | null;
  website: string | null;
  company: string | null;
  location: string | null;
  notes: string | null;
}

interface ConnectedAccountRow {
  platform: string | null;
  username: string | null;
  display_name: string | null;
  disconnected_at: string | null;
}

interface IdeaFromModel {
  title?: unknown;
  summary?: unknown;
  rationale?: unknown;
}

function sanitizeString(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

async function loadContext(
  supabase: SupabaseLike,
  businessProfileId: string
): Promise<{
  profile: BusinessProfileRow | null;
  platforms: string[];
}> {
  const [profileRes, accountsRes] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("id, name, website, company, location, notes")
      .eq("id", businessProfileId)
      .maybeSingle(),
    supabase
      .from("connected_accounts")
      .select("platform, username, display_name, disconnected_at")
      .eq("business_profile_id", businessProfileId),
  ]);

  const profile = (profileRes?.data ?? null) as BusinessProfileRow | null;
  const accountsRaw = Array.isArray(accountsRes?.data)
    ? (accountsRes.data as ConnectedAccountRow[])
    : [];
  const platforms = Array.from(
    new Set(
      accountsRaw
        .filter((a) => !a.disconnected_at && a.platform)
        .map((a) => String(a.platform))
    )
  );

  return { profile, platforms };
}

const PLATFORM_TIPS: Record<string, string> = {
  instagram: "Prioritera Reels (korta videor), karusellposter och Stories med engagerande frågor.",
  tiktok: "Fokusera på trender, humoristiskt innehåll och bakom-kulisserna-klipp.",
  youtube: "Längre tutorials, listicles och svar på vanliga kundfrÅgor fungerar bäst.",
  facebook: "Lokala evenemang, kundberättelser och delade branschnyheter driver engagemang.",
  google_business: "Svara på recensioner, lägg upp foton och uppdatera öppettider regelbundet.",
  x: "Korta, spetsiga åsikter, branschinsikter och dialog med community.",
  linkedin: "Tankeledarskapsinlägg, fallstudier och rekryteringsinnehåll.",
  google_reviews: "Uppmuntra nöjda kunder att recensera och svara på alla recensioner inom 24 timmar.",
};

function buildPrompt(
  profile: BusinessProfileRow,
  platforms: string[],
  ideaCount: number
): { system: string; user: string } {
  const system = [
    "Du är en erfaren digital marknadsföringsstrateg med fokus på SME-företag.",
    "Du ger konkreta, plattformsspecifika innehållsidéer som ett litet team kan genomföra direkt.",
    "Svara ALLTID på svenska.",
    "Varje förslag ska vara unikt, specificerat till företagets bransch/plats, och koppla till de angivna plattformarna.",
    "Undvik generiska råd som 'posta oftare' eller 'engagera med följare'.",
    "Var specifik: nämn format, ämne och varför det passar just detta företag.",
  ].join(" ");

  const platformLabel =
    platforms.length > 0
      ? platforms.join(", ")
      : "(inga plattformar anslutna än)";

  const platformHints = platforms
    .filter((p) => PLATFORM_TIPS[p])
    .map((p) => `- ${p}: ${PLATFORM_TIPS[p]}`)
    .join("\n");

  const profileLines: string[] = [];
  if (profile.name) profileLines.push(`Profilnamn: ${profile.name}`);
  if (profile.company) profileLines.push(`Företagsnamn: ${profile.company}`);
  if (profile.website) profileLines.push(`Webbplats: ${profile.website}`);
  if (profile.location) profileLines.push(`Plats: ${profile.location}`);
  if (profile.notes) {
    profileLines.push(`Noteringar om verksamheten: ${profile.notes.slice(0, 600)}`);
  }

  const user = [
    "## Företagsinformation",
    profileLines.join("\n") || "(ingen extra metadata)",
    "",
    `## Anslutna plattformar`,
    platformLabel,
    "",
    platformHints ? `## Plattformstips att ta hänsyn till\n${platformHints}` : "",
    "",
    `## Uppgift`,
    `Ge exakt ${ideaCount} konkreta innehållsidéer anpassade till detta specifika företag.`,
    "Variera idéerna: inkludera minst ett engagerande inlägg, ett utbildande inlägg och ett kampanjinlägg.",
    "",
    "Returnera ENDAST JSON utan kommentarer eller markdown:",
    `{"ideas":[{"title":"Kort, lockande rubrik (max 80 tecken)","summary":"2-3 meningar som beskriver exakt vad som ska göras och hur","rationale":"1 mening om varför detta passar just detta företag och denna plattform"}]}`,
  ].filter(Boolean).join("\n");

  return { system, user };
}

async function expireExistingLlmRecs(
  supabase: SupabaseLike,
  businessProfileId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("ai_recommendations")
    .update({ status: "expired" })
    .eq("business_profile_id", businessProfileId)
    .eq("module", LLM_CONTENT_MODULE)
    .in("status", ["new", "seen"])
    .select("id");

  if (error) {
    throw new Error(`expire previous llm recs failed: ${error.message}`);
  }
  return Array.isArray(data) ? data.length : 0;
}

interface InsertPlan {
  business_profile_id: string;
  kind: "content";
  status: "new";
  title: string;
  summary: string | null;
  rationale: string | null;
  confidence: number;
  module: typeof LLM_CONTENT_MODULE;
  related_type: "business_profile";
  related_id: string;
  suggested_action: Record<string, unknown>;
  context: Record<string, unknown>;
}

function ideaToRow(
  businessProfileId: string,
  idea: IdeaFromModel,
  slot: number,
  runId: string,
  platforms: string[]
): InsertPlan | null {
  const title = sanitizeString(idea.title, 120);
  if (!title) return null;
  const summary = sanitizeString(idea.summary, 600);
  const rationale = sanitizeString(idea.rationale, 400);

  return {
    business_profile_id: businessProfileId,
    kind: "content",
    status: "new",
    title,
    summary,
    rationale,
    confidence: 0.55,
    module: LLM_CONTENT_MODULE,
    related_type: "business_profile",
    related_id: businessProfileId,
    suggested_action: { type: "navigate", to: "/content" },
    context: {
      signal: "content_suggestion",
      slot,
      runId,
      platforms,
      source: "openai:gpt-4o-mini",
    },
  };
}

async function insertRows(
  supabase: SupabaseLike,
  rows: InsertPlan[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("ai_recommendations").insert(rows);
  if (error) {
    throw new Error(`insert llm recs failed: ${error.message}`);
  }
  return rows.length;
}

export interface RegenerateLlmOptions {
  businessProfileId: string;
  ideaCount?: number;
}

/**
 * Main entry point. Expires all active LLM-content recs, calls OpenAI,
 * and inserts a fresh batch. Safe to call repeatedly — each call replaces
 * the previous batch.
 *
 * Wraps the actual work in in-flight coalescing + a short cooldown (see
 * the `inflight` / `cooldown` maps above) so rapid clicks don't translate
 * into duplicate paid API calls.
 */
export async function regenerateLlmContentSuggestions(
  supabase: SupabaseLike,
  opts: RegenerateLlmOptions
): Promise<LlmContentResult> {
  const key = opts.businessProfileId;

  // Cheapest shortcut: no key → no work, no cache needed.
  if (!hasOpenAiKey()) {
    return { created: 0, expired: 0, skipped: "no_api_key" };
  }

  // Cooldown hit: a recent successful run happened; don't spend tokens.
  if (isCooldownActive(key)) {
    return { created: 0, expired: 0, skipped: "cached" };
  }

  // In-flight coalescing: join an existing call for this bp if any.
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const result = await runLlmContentSuggestions(supabase, opts);
      // Only cache genuine successful work. Skipped/errored runs stay
      // retry-friendly so users aren't blocked by a transient provider
      // failure.
      if (!result.skipped && !result.error) {
        markCooldown(key);
      }
      return result;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/**
 * The actual work. Not exported — callers should go through
 * `regenerateLlmContentSuggestions` so they benefit from coalescing and
 * cooldown. Kept separate so the wrapper reads cleanly.
 */
async function runLlmContentSuggestions(
  supabase: SupabaseLike,
  opts: RegenerateLlmOptions
): Promise<LlmContentResult> {
  const ideaCount = Math.max(
    1,
    Math.min(MAX_IDEAS, opts.ideaCount ?? DEFAULT_IDEAS)
  );

  let expired = 0;
  try {
    expired = await expireExistingLlmRecs(supabase, opts.businessProfileId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[llm] expire previous recs failed:", message);
    return { created: 0, expired: 0, skipped: "provider_error", error: message };
  }

  let profile: BusinessProfileRow | null = null;
  let platforms: string[] = [];
  try {
    const ctx = await loadContext(supabase, opts.businessProfileId);
    profile = ctx.profile;
    platforms = ctx.platforms;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[llm] loadContext failed:", message);
    return { created: 0, expired, skipped: "provider_error", error: message };
  }

  if (!profile) {
    return { created: 0, expired, skipped: "no_signal" };
  }

  const { system, user } = buildPrompt(profile, platforms, ideaCount);

  let ideasRaw: unknown;
  try {
    const response = await chatJson({ system, user });
    ideasRaw = response.ideas;
  } catch (err) {
    const message =
      err instanceof LlmRequestError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    console.warn("[llm] content suggestions call failed:", message);
    return { created: 0, expired, skipped: "provider_error", error: message };
  }

  if (!Array.isArray(ideasRaw)) {
    return {
      created: 0,
      expired,
      skipped: "provider_error",
      error: "model did not return an `ideas` array",
    };
  }

  const runId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now());

  const rows: InsertPlan[] = [];
  for (let i = 0; i < ideasRaw.length && rows.length < MAX_IDEAS; i += 1) {
    const row = ideaToRow(
      opts.businessProfileId,
      ideasRaw[i] as IdeaFromModel,
      i + 1,
      runId,
      platforms
    );
    if (row) rows.push(row);
  }

  let created = 0;
  try {
    created = await insertRows(supabase, rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[llm] insert rows failed:", message);
    return { created: 0, expired, skipped: "provider_error", error: message };
  }

  return { created, expired };
}
