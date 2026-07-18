import { t } from "@/lib/i18n";
import { apiJson } from "@/lib/apiJson";

export type ReelUploadParams = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
  uploadUrl: string;
};

export type ReelUploadedClip = {
  publicId: string;
  duration: number;
  secureUrl: string;
  bytes: number;
};

export type ReelComposeResult = {
  url: string;
  posterUrl: string;
  totalSeconds: number;
  segments: Array<{ publicId: string; seconds: number; startOffset: number }>;
};

/** Signed params for a direct browser→Cloudinary video upload. */
export async function fetchReelUploadParams(businessProfileId: string): Promise<ReelUploadParams> {
  return apiJson("/api/content/reel/upload-params", t("content:reel.errors.uploadParams"), {
    body: { business_profile_id: businessProfileId },
  });
}

/**
 * Uploads one clip directly to Cloudinary (bypasses our API's body limits so
 * full-size phone videos work). Reports progress in [0, 1].
 */
export function uploadReelClip(
  file: Blob,
  filename: string,
  params: ReelUploadParams,
  onProgress?: (fraction: number) => void
): Promise<ReelUploadedClip> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file, filename);
    form.append("api_key", params.apiKey);
    form.append("timestamp", String(params.timestamp));
    form.append("folder", params.folder);
    form.append("signature", params.signature);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", params.uploadUrl);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new Error(t("content:reel.errors.uploadFailed")));
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as {
        public_id?: string;
        duration?: number;
        secure_url?: string;
        bytes?: number;
        error?: { message?: string };
      };
      if (xhr.status >= 200 && xhr.status < 300 && body.public_id) {
        resolve({
          publicId: String(body.public_id),
          duration: Number(body.duration) || 0,
          secureUrl: String(body.secure_url || ""),
          bytes: Number(body.bytes) || 0,
        });
        return;
      }
      reject(new Error(body.error?.message || t("content:reel.errors.uploadFailed")));
    };
    xhr.send(form);
  });
}

export async function composeReel(payload: {
  clips: Array<{ publicId: string; duration: number; startOffset?: number }>;
  target: 30 | 60;
  businessProfileId: string;
}): Promise<ReelComposeResult> {
  return apiJson("/api/content/reel/compose", t("content:reel.errors.composeFailed"), {
    body: {
      clips: payload.clips,
      target: payload.target,
      business_profile_id: payload.businessProfileId,
    },
  });
}
