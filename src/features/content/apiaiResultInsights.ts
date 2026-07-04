import type { ApiaiRunResult, ApiaiTool } from "./apiaiClient";

export type PublishReadiness = {
  ok: boolean;
  label: string;
  detail?: string;
  severity: "ok" | "warn" | "block";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function moderationInsight(data: Record<string, unknown>): PublishReadiness {
  const decision = String(data.decision || "").toLowerCase();
  if (decision === "allow") {
    return { ok: true, severity: "ok", label: "Moderation passed", detail: "Image is allowed to publish." };
  }
  if (decision === "review") {
    const reason = Array.isArray(data.reasons)
      ? data.reasons
          .map((item) => asRecord(item)?.message)
          .filter(Boolean)
          .join("; ")
      : "";
    return {
      ok: false,
      severity: "warn",
      label: "Needs review",
      detail: reason || "Moderation flagged this image for human review before publishing.",
    };
  }
  const reason = Array.isArray(data.reasons)
    ? data.reasons
        .map((item) => asRecord(item)?.message)
        .filter(Boolean)
        .join("; ")
    : "";
  return {
    ok: false,
    severity: "block",
    label: "Moderation blocked",
    detail: reason || "This image did not pass the moderation policy.",
  };
}

function qualityGateInsight(data: Record<string, unknown>): PublishReadiness {
  const answer = String(data.answer ?? data.result ?? data.pass ?? "").toLowerCase();
  const score = typeof data.score === "number" ? data.score : null;
  if (answer === "yes" || answer === "true" || answer === "pass" || answer === "passed") {
    return {
      ok: true,
      severity: "ok",
      label: "Quality check passed",
      detail: score != null ? `Score: ${score}` : undefined,
    };
  }
  if (answer === "no" || answer === "false" || answer === "fail" || answer === "failed") {
    return {
      ok: false,
      severity: "warn",
      label: "Quality check failed",
      detail: String(data.explanation || data.reason || "Consider improving the asset before publishing."),
    };
  }
  return {
    ok: true,
    severity: "ok",
    label: "Quality check complete",
    detail: "Review the JSON result before publishing.",
  };
}

export function insightFromApiaiResult(result: ApiaiRunResult, tool?: ApiaiTool | null): PublishReadiness | null {
  if (result.resultType !== "json") return null;
  const data = asRecord(result.data);
  if (!data) return null;

  const endpoint = String(tool?.endpoint || "").toLowerCase();
  const slug = String(tool?.slug || "").toLowerCase();
  if (endpoint.includes("moderation") || slug.includes("moderation")) {
    return moderationInsight(data);
  }
  if (endpoint.includes("quality-gate") || slug.includes("quality")) {
    return qualityGateInsight(data);
  }
  if ("decision" in data) return moderationInsight(data);
  if ("answer" in data || "pass" in data) return qualityGateInsight(data);
  return null;
}

export function publishBlockReason(readiness: PublishReadiness | null | undefined): string | null {
  if (!readiness || readiness.ok || readiness.severity !== "block") return null;
  return readiness.detail || readiness.label;
}
