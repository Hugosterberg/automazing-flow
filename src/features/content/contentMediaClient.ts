import { t } from "@/lib/i18n";
import { apiJson } from "@/lib/apiJson";

export async function generateSocialImage(payload: {
  prompt: string;
  caption: string;
  businessProfileId: string | null;
}): Promise<{ url: string; previewUrl?: string; source: string }> {
  return apiJson("/api/content/image/generate", t("content:errors.generateImage"), {
    body: {
      prompt: payload.prompt,
      caption: payload.caption,
      business_profile_id: payload.businessProfileId,
    },
    timeoutMs: 70_000,
  });
}

export async function exportCanvaImage(payload: {
  designId: string;
  businessProfileId: string | null;
}): Promise<{ url: string; canvaUrl?: string; source: string }> {
  return apiJson("/api/content/canva/export", t("content:errors.exportCanva"), {
    body: {
      designId: payload.designId,
      format: "png",
      business_profile_id: payload.businessProfileId,
    },
    timeoutMs: 60_000,
  });
}

export function normalizeCanvaDesignId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const designIndex = parts.findIndex((part) => part === "design");
    if (designIndex >= 0 && parts[designIndex + 1]) return parts[designIndex + 1];
  } catch {
    // Plain design id, not a URL.
  }
  return trimmed.replace(/^design:/i, "").trim();
}

export async function uploadContentMedia(payload: {
  file: File;
  businessProfileId: string | null;
}): Promise<{ url: string; contentType: string; filename: string }> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(t("content:upload.readFailed")));
    reader.readAsDataURL(payload.file);
  });
  const data = await apiJson<{ url?: unknown; contentType?: unknown; filename?: unknown }>(
    "/api/content/media/upload",
    t("content:errors.uploadImage"),
    {
      body: {
        dataBase64,
        contentType: payload.file.type || "image/png",
        filename: payload.file.name,
        business_profile_id: payload.businessProfileId,
      },
      timeoutMs: 60_000,
    }
  );
  return {
    url: String(data.url || ""),
    contentType: String(data.contentType || payload.file.type || "image/png"),
    filename: String(data.filename || payload.file.name),
  };
}

export interface CanvaBrandTemplateSummary {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

/** Browse the caller's Canva Brand Templates — the style Brand Studio autofills into. */
export async function listCanvaBrandTemplates(payload: {
  businessProfileId: string | null;
  query?: string;
}): Promise<{ items: CanvaBrandTemplateSummary[] }> {
  const qs = new URLSearchParams();
  if (payload.businessProfileId) qs.set("business_profile_id", payload.businessProfileId);
  if (payload.query?.trim()) qs.set("query", payload.query.trim());
  const suffix = qs.toString();
  return apiJson(
    `/api/content/canva/brand-templates${suffix ? `?${suffix}` : ""}`,
    t("content:errors.listCanvaTemplates"),
    { method: "GET", timeoutMs: 20_000 }
  );
}

export interface CanvaBrandGenerateResult {
  title: string;
  hook: string;
  format: string;
  cta: string;
  designId: string;
  editUrl: string | null;
  imageUrl: string;
}

/** AI headlines + Canva Autofill → N on-brand design candidates from one Brand Template. */
export async function generateCanvaBrandBatch(payload: {
  businessProfileId: string | null;
  brandTemplateId: string;
  count: number;
  businessName?: string;
  audience?: string;
  toneOfVoice?: string;
  topics?: string;
  maxHeadlineChars: number;
}): Promise<{ ok: true; results: CanvaBrandGenerateResult[]; source: "ai" | "heuristic"; errors?: string[] }> {
  return apiJson("/api/content/canva/brand-kit/generate", t("content:errors.generateCanvaBrandBatch"), {
    body: {
      business_profile_id: payload.businessProfileId,
      brandTemplateId: payload.brandTemplateId,
      count: payload.count,
      businessName: payload.businessName,
      audience: payload.audience,
      toneOfVoice: payload.toneOfVoice,
      topics: payload.topics,
      maxHeadlineChars: payload.maxHeadlineChars,
    },
    timeoutMs: 120_000,
  });
}
