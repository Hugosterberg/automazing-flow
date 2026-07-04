import { apiUrl } from "@/lib/apiBase";
import { apiErrorMessage } from "@/lib/apiError";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export async function generateSocialImage(payload: {
  prompt: string;
  caption: string;
  businessProfileId: string | null;
}): Promise<{ url: string; previewUrl?: string; source: string }> {
  const res = await fetchWithTimeout(apiUrl("/api/content/image/generate"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: payload.prompt,
      caption: payload.caption,
      business_profile_id: payload.businessProfileId,
    }),
  }, 70_000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(data, "Could not generate image"));
  return data;
}

export async function exportCanvaImage(payload: {
  designId: string;
  businessProfileId: string | null;
}): Promise<{ url: string; canvaUrl?: string; source: string }> {
  const res = await fetchWithTimeout(apiUrl("/api/content/canva/export"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      designId: payload.designId,
      format: "png",
      business_profile_id: payload.businessProfileId,
    }),
  }, 60_000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(data, "Could not export Canva design"));
  return data;
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
  const res = await fetchWithTimeout(apiUrl("/api/content/media/upload"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataBase64,
      contentType: payload.file.type || "image/png",
      filename: payload.file.name,
      business_profile_id: payload.businessProfileId,
    }),
  }, 60_000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(data, "Could not upload image"));
  return {
    url: String(data.url || ""),
    contentType: String(data.contentType || payload.file.type || "image/png"),
    filename: String(data.filename || payload.file.name),
  };
}
