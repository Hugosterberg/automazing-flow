import net from "net";
import { lookup } from "node:dns/promises";

export function hostAllowed(hostname: string, allowedHosts: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function isPrivateHostname(hostname: string): boolean {
  let host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }
  if (host.startsWith("::ffff:") && net.isIP(host.slice(7)) === 4) {
    host = host.slice(7);
  }
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }
  if (ipVersion === 6) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  }
  return false;
}

export async function assertPublicHost(url: URL): Promise<void> {
  if (isPrivateHostname(url.hostname)) throw new Error("blocked_hostname");
  if (net.isIP(url.hostname)) return;
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    return;
  }
  if (addresses.some((entry) => isPrivateHostname(entry.address))) {
    throw new Error("blocked_hostname");
  }
}

export type FetchPublicUrlOptions = {
  init?: RequestInit;
  timeoutMs?: number;
  allowedHosts?: string[];
  userAgent?: string;
  accept?: string;
};

export async function fetchPublicUrl(rawUrl: string, options: FetchPublicUrlOptions = {}): Promise<Response> {
  const {
    init = {},
    timeoutMs = 12000,
    allowedHosts,
    userAgent = "AutomazingFlowPublicFetch/1.0",
    accept = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  } = options;

  let current = new URL(rawUrl);
  for (let hop = 0; hop < 5; hop++) {
    if (allowedHosts && !hostAllowed(current.hostname, allowedHosts)) {
      throw new Error("unsupported_host");
    }
    await assertPublicHost(current);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(current.toString(), {
        redirect: "manual",
        ...init,
        signal: controller.signal,
        headers: {
          "User-Agent": userAgent,
          Accept: accept,
          ...(init.headers || {}),
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return res;
        current = new URL(location, current);
        continue;
      }
      return res;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("too_many_redirects");
}

export async function readResponseWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("response_too_large");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error("response_too_large");
    return buffer;
  }
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("response_too_large");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
