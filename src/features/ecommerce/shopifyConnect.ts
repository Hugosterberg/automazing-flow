export const SHOPIFY_DOMAIN_EXAMPLE = "mystore.myshopify.com";

const SHOPIFY_HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;

function handleToDomain(handle: string): string | null {
  const normalized = handle.trim().toLowerCase();
  return SHOPIFY_HANDLE_RE.test(normalized) ? `${normalized}.myshopify.com` : null;
}

export function normalizeShopifyShopDomain(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (host === "admin.shopify.com") {
      const storeHandle = parsed.pathname.match(/^\/store\/([^/?#]+)/i)?.[1] ?? "";
      return handleToDomain(storeHandle);
    }

    if (host.endsWith(".myshopify.com")) {
      const handle = host.replace(/\.myshopify\.com$/, "");
      return handleToDomain(handle);
    }

    if (!host.includes(".")) {
      return handleToDomain(host);
    }
  } catch {
    // Fall through to the plain handle parser below.
  }

  return handleToDomain(raw.replace(/^https?:\/\//i, "").split(/[/?#]/, 1)[0] ?? "");
}
