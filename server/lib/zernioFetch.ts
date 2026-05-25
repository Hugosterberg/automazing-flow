import http from "node:http";
import https from "node:https";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function allowInsecureZernioTls(): boolean {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") return false;
  const value = String(
    process.env.ZERNIO_ALLOW_SELF_SIGNED_CERTS || process.env.ZERNIO_ALLOW_INSECURE_TLS || ""
  )
    .trim()
    .toLowerCase();
  return TRUE_VALUES.has(value);
}

export function zernioFetchErrorMessage(error: unknown): string {
  const err = error as { message?: unknown; cause?: { code?: unknown; message?: unknown } } | null;
  const message = err?.message ? String(err.message) : String(error || "fetch_failed");
  const causeCode = err?.cause?.code ? String(err.cause.code) : "";
  const causeMessage = err?.cause?.message ? String(err.cause.message) : "";
  return [causeCode, message, causeMessage].filter(Boolean).join(":").slice(0, 240);
}

function isCertificateChainError(error: unknown): boolean {
  const message = zernioFetchErrorMessage(error).toUpperCase();
  return (
    message.includes("SELF_SIGNED_CERT_IN_CHAIN") ||
    message.includes("DEPTH_ZERO_SELF_SIGNED_CERT") ||
    message.includes("UNABLE_TO_VERIFY_LEAF_SIGNATURE") ||
    message.includes("UNABLE_TO_GET_ISSUER_CERT") ||
    message.includes("CERT_HAS_EXPIRED")
  );
}

function headersFromInit(headers: RequestInit["headers"]): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, value]));
  }
  return Object.fromEntries(
    Object.entries(headers as Record<string, string | number | boolean>).map(([key, value]) => [
      key,
      String(value),
    ])
  );
}

function responseHeadersFromNode(headers: http.IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      result.set(key, value.join(", "));
    } else if (value != null) {
      result.set(key, String(value));
    }
  }
  return result;
}

function bodyFromInit(body: RequestInit["body"]): string | Buffer | null {
  if (body == null) return null;
  if (typeof body === "string" || Buffer.isBuffer(body)) return body;
  if (body instanceof URLSearchParams) return body.toString();
  return String(body);
}

function fetchWithInsecureTls(url: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = bodyFromInit(init.body);
    const headers = headersFromInit(init.headers);
    if (body != null && !headers["Content-Length"] && !headers["content-length"]) {
      headers["Content-Length"] = String(Buffer.byteLength(body));
    }

    const transport = parsed.protocol === "http:" ? http : https;
    const requestOptions: http.RequestOptions & https.RequestOptions = {
      method: init.method || "GET",
      headers,
      rejectUnauthorized: parsed.protocol === "https:" ? false : undefined,
    };

    const req = transport.request(parsed, requestOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        resolve(
          new Response(Buffer.concat(chunks), {
            status: res.statusCode || 500,
            statusText: res.statusMessage || "",
            headers: responseHeadersFromNode(res.headers),
          })
        );
      });
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

export async function fetchZernio(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!allowInsecureZernioTls() || !isCertificateChainError(error)) {
      throw error;
    }
    console.warn(
      "[Zernio] Retrying request with insecure TLS because ZERNIO_ALLOW_SELF_SIGNED_CERTS is enabled. Use NODE_EXTRA_CA_CERTS or fix the upstream certificate before production."
    );
    return fetchWithInsecureTls(url, init);
  }
}
