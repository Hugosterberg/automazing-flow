import { apiJson } from "@/lib/apiJson";

export async function generateSocialImage(payload: {
  prompt: string;
  caption: string;
  businessProfileId: string | null;
}): Promise<{ url: string; previewUrl?: string; source: string }> {
  return apiJson("/api/content/image/generate", "Could not generate image", {
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
  return apiJson("/api/content/canva/export", "Could not export Canva design", {
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
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(payload.file);
  });
  const data = await apiJson<{ url?: unknown; contentType?: unknown; filename?: unknown }>(
    "/api/content/media/upload",
    "Could not upload image",
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
