/**
 * Run the same subject (domain or company) against multiple MCP providers in
 * parallel. Each source returns independently — no first-wins fallback — so
 * the UI can show different judgments side by side with clear attribution.
 */

import { findMcpAccountForProfile, type StoredMcpAccount } from "./mcpAccess.ts";
import { mcpCatalogEntry } from "./mcpCatalog.ts";
import { assessMcpAccount } from "./mcpReadiness.ts";
import { runMcpQuery } from "./mcpQuery.ts";

interface TokenStoreLike {
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
}

export type AssessmentKind = "domain" | "company";

export type SourceSkipReason =
  | "not_connected"
  | "missing_credential"
  | "auth_expired"
  | "forbidden"
  | "unknown_platform";

export interface AssessmentSourceDefinition {
  id: string;
  platform: string;
  /** What this provider evaluates — shown in the UI so users compare lenses. */
  lens: string;
  buildQuery: (subject: string, kind: AssessmentKind) => string;
  toolPatterns: RegExp[];
  argCandidates: string[];
  maxChars?: number;
}

export interface McpSourceAssessment {
  sourceId: string;
  platform: string;
  providerLabel: string;
  lens: string;
  status: "success" | "skipped" | "error";
  skipReason?: SourceSkipReason;
  message?: string;
  tool?: string;
  query?: string;
  text?: string;
}

export interface MultiSourceAssessmentResult {
  subject: string;
  kind: AssessmentKind;
  sources: McpSourceAssessment[];
  summary: { total: number; success: number; skipped: number; error: number };
  fetchedAt: string;
}

/** Providers that can assess a domain/company from different angles. */
export const MULTI_SOURCE_ASSESSMENT_SOURCES: AssessmentSourceDefinition[] = [
  {
    id: "seo",
    platform: "ahrefs",
    lens: "SEO strength & organic visibility",
    buildQuery: (subject) => subject,
    toolPatterns: [/site/i, /domain/i, /overview/i, /seo/i, /search/i],
    argCandidates: ["target", "domain", "url", "query"],
    maxChars: 6_000,
  },
  {
    id: "domain-dns",
    platform: "godaddy",
    lens: "Domain registration & DNS health",
    buildQuery: (subject) => subject,
    toolPatterns: [/domain/i, /lookup/i, /dns/i, /whois/i, /search/i],
    argCandidates: ["domain", "name", "query", "url"],
    maxChars: 4_000,
  },
  {
    id: "competitive",
    platform: "peec",
    lens: "Competitive market position",
    buildQuery: (subject, kind) =>
      kind === "domain"
        ? `${subject} — competitive landscape, positioning, and market perception`
        : `${subject} — competitive landscape and positioning`,
    toolPatterns: [/compet/i, /company/i, /research/i, /search/i],
    argCandidates: ["query", "company", "name", "text"],
    maxChars: 6_000,
  },
  {
    id: "web-exa",
    platform: "exa",
    lens: "Web & company intelligence (Exa)",
    buildQuery: (subject, kind) =>
      kind === "domain"
        ? `${subject} company overview reputation news digital presence`
        : `${subject} company overview news reputation`,
    toolPatterns: [/web_search/i, /^search/i, /company/i, /prospect/i],
    argCandidates: ["query", "q", "search", "text", "prompt"],
    maxChars: 6_000,
  },
  {
    id: "web-sprouts",
    platform: "sprouts",
    lens: "Prospect & firmographic signals (Sprouts)",
    buildQuery: (subject, kind) =>
      kind === "domain"
        ? `${subject} company prospect overview firmographics`
        : `${subject} prospect company overview`,
    toolPatterns: [/prospect/i, /company/i, /search/i, /web_search/i],
    argCandidates: ["query", "q", "search", "name", "text"],
    maxChars: 6_000,
  },
  {
    id: "marketing-supermetrics",
    platform: "supermetrics_mcp",
    lens: "Paid & channel marketing metrics (Supermetrics)",
    buildQuery: (subject) =>
      `Marketing and advertising performance, spend, and channel mix for ${subject}`,
    toolPatterns: [/query/i, /report/i, /metric/i, /data/i, /search/i],
    argCandidates: ["query", "q", "prompt", "text", "question"],
    maxChars: 6_000,
  },
  {
    id: "marketing-windsor",
    platform: "windsor",
    lens: "Cross-channel marketing data (Windsor)",
    buildQuery: (subject) =>
      `Cross-channel marketing metrics and campaign performance for ${subject}`,
    toolPatterns: [/query/i, /report/i, /metric/i, /data/i, /search/i],
    argCandidates: ["query", "q", "prompt", "text", "question"],
    maxChars: 6_000,
  },
  {
    id: "context-era",
    platform: "era",
    lens: "Business context & digital footprint (Era)",
    buildQuery: (subject, kind) =>
      kind === "domain"
        ? `Business context, digital presence, and brand signals for ${subject}`
        : `Business context and market signals for ${subject}`,
    toolPatterns: [/context/i, /search/i, /query/i, /tool/i],
    argCandidates: ["query", "q", "prompt", "text", "question"],
    maxChars: 6_000,
  },
];

export function normalizeAssessmentSubject(raw: string): { subject: string; kind: AssessmentKind } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const hostPart = withoutProtocol.split("/")[0]?.split("?")[0]?.trim() ?? "";
  const looksLikeDomain =
    hostPart.includes(".") &&
    !hostPart.includes(" ") &&
    /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(hostPart);

  if (looksLikeDomain) {
    return { subject: hostPart.toLowerCase(), kind: "domain" };
  }
  return { subject: trimmed, kind: "company" };
}

async function assessOneSource(options: {
  tokenStore: TokenStoreLike;
  businessProfileId: string | null;
  userId: string;
  getStoredAccountAccess: (
    stored: Record<string, unknown> | null | undefined,
    userId: string
  ) => { allowed: boolean };
  source: AssessmentSourceDefinition;
  subject: string;
  kind: AssessmentKind;
}): Promise<McpSourceAssessment> {
  const entry = mcpCatalogEntry(options.source.platform);
  const providerLabel = entry?.label || options.source.platform;
  const base = {
    sourceId: options.source.id,
    platform: options.source.platform,
    providerLabel,
    lens: options.source.lens,
  };

  if (!entry) {
    return { ...base, status: "skipped", skipReason: "unknown_platform", message: "Unknown provider." };
  }

  const account = await findMcpAccountForProfile({
    tokenStore: options.tokenStore,
    businessProfileId: options.businessProfileId,
    platforms: [options.source.platform],
  });

  if (!account) {
    return {
      ...base,
      status: "skipped",
      skipReason: "not_connected",
      message: `${providerLabel} is not connected.`,
    };
  }

  const readiness = await assessMcpAccount(options.tokenStore, account as StoredMcpAccount);
  if (readiness.status === "missing_credential") {
    return {
      ...base,
      status: "skipped",
      skipReason: "missing_credential",
      message: readiness.message || "API key missing.",
    };
  }
  if (readiness.status === "auth_expired") {
    return {
      ...base,
      status: "skipped",
      skipReason: "auth_expired",
      message: readiness.message || "OAuth expired — reconnect.",
    };
  }
  if (readiness.status !== "ready") {
    return {
      ...base,
      status: "skipped",
      skipReason: "not_connected",
      message: readiness.message || `${providerLabel} is not ready.`,
    };
  }

  const access = options.getStoredAccountAccess(account, options.userId);
  if (!access.allowed) {
    return {
      ...base,
      status: "skipped",
      skipReason: "forbidden",
      message: "Account belongs to another user.",
    };
  }

  const query = options.source.buildQuery(options.subject, options.kind);
  const result = await runMcpQuery({
    tokenStore: options.tokenStore,
    account: account as StoredMcpAccount,
    toolPatterns: options.source.toolPatterns,
    argCandidates: options.source.argCandidates,
    query,
    maxChars: options.source.maxChars,
  });

  if (result.ok === false) {
    return {
      ...base,
      status: "error",
      query,
      message: result.error,
    };
  }

  return {
    ...base,
    status: "success",
    tool: result.tool,
    query,
    text: result.text,
  };
}

export async function runMultiSourceAssessment(options: {
  tokenStore: TokenStoreLike;
  businessProfileId: string | null;
  userId: string;
  getStoredAccountAccess: (
    stored: Record<string, unknown> | null | undefined,
    userId: string
  ) => { allowed: boolean };
  subjectInput: string;
  sources?: AssessmentSourceDefinition[];
}): Promise<MultiSourceAssessmentResult | { error: string; status: number }> {
  const normalized = normalizeAssessmentSubject(options.subjectInput);
  if (!normalized) {
    return { error: "Enter a domain (e.g. acme.com) or company name.", status: 400 };
  }

  const sources = options.sources ?? MULTI_SOURCE_ASSESSMENT_SOURCES;
  const assessments = await Promise.all(
    sources.map((source) =>
      assessOneSource({
        tokenStore: options.tokenStore,
        businessProfileId: options.businessProfileId,
        userId: options.userId,
        getStoredAccountAccess: options.getStoredAccountAccess,
        source,
        subject: normalized.subject,
        kind: normalized.kind,
      })
    )
  );

  const summary = {
    total: assessments.length,
    success: assessments.filter((a) => a.status === "success").length,
    skipped: assessments.filter((a) => a.status === "skipped").length,
    error: assessments.filter((a) => a.status === "error").length,
  };

  return {
    subject: normalized.subject,
    kind: normalized.kind,
    sources: assessments,
    summary,
    fetchedAt: new Date().toISOString(),
  };
}
