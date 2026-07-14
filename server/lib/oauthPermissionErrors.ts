/**
 * OAuth permission / scope error classification for connect callbacks and sync health.
 * Keep behavior aligned with src/lib/oauthPermissionErrors.ts (re-exports this module).
 */

export type OAuthProviderFamily =
  | "shopify"
  | "google"
  | "meta"
  | "microsoft"
  | "tiktok"
  | "x"
  | "canva"
  | "notion"
  | "zernio"
  | "generic";

export type OAuthPermissionGuidance = {
  title: string;
  steps: string[];
  dashboardLabel?: string;
  dashboardUrl?: string;
};

const PERMISSION_CODE_EXACT = new Set([
  "scope_not_granted",
  "missing_shopify_permission",
  "access_denied",
  "invalid_scope",
  "insufficient_permissions",
  "interaction_required",
]);

const PERMISSION_TEXT_PATTERN =
  /\b(permission|permissions|scope|scopes|consent|not.?granted|insufficient|forbidden|access.?denied|unauthorized.?scope|oauth.?exception)\b/i;

const MISSING_PROVIDER_PERMISSION_PATTERN = /^missing_[a-z0-9]+_permission$/i;

const SYNC_PERMISSION_PATTERN =
  /\b(permission|permissions|scope|scopes|forbidden|insufficient|access.?denied|403|reconnect.*grant|not.?authorized)\b/i;

export function normalizeOAuthErrorCode(rawCode: string, hint?: string | null): string {
  const code = String(rawCode || "").trim();
  if (!code) return "token_exchange_failed";

  const haystack = `${code} ${hint || ""}`.toLowerCase();

  if (code === "missing_shopify_permission" || haystack.includes("missing_shopify_permission")) {
    return "missing_shopify_permission";
  }

  if (haystack.includes("customer_read_") || haystack.includes("customer_write_")) {
    return "missing_shopify_permission";
  }

  if (code === "invalid_scope" || haystack.includes("invalid_scope")) {
    return "scope_not_granted";
  }

  if (MISSING_PROVIDER_PERMISSION_PATTERN.test(code) && code !== "missing_shopify_permission") {
    return "scope_not_granted";
  }

  if (PERMISSION_TEXT_PATTERN.test(code) || PERMISSION_TEXT_PATTERN.test(hint || "")) {
    if (!PERMISSION_CODE_EXACT.has(code) && code.length < 120) {
      return "scope_not_granted";
    }
  }

  return code;
}

export function isOAuthPermissionError(code: string, hint?: string | null): boolean {
  const normalized = normalizeOAuthErrorCode(code, hint);
  if (
    normalized === "scope_not_granted" ||
    normalized === "missing_shopify_permission" ||
    normalized === "access_denied" ||
    normalized === "user_cancelled"
  ) {
    return true;
  }
  if (PERMISSION_TEXT_PATTERN.test(code) || PERMISSION_TEXT_PATTERN.test(hint || "")) return true;
  if (MISSING_PROVIDER_PERMISSION_PATTERN.test(code)) return true;
  return false;
}

export function extractOAuthPermissionDetail(hint?: string | null, code?: string | null): string | null {
  const source = `${hint || ""} ${code || ""}`.trim();
  if (!source) return null;

  const shopifyScope = source.match(/\b(customer_[a-z0-9_]+)\b/i)?.[1];
  if (shopifyScope) return shopifyScope;

  const labeledScope = source.match(/(?:scope|permission|behörighet)[:\s]+([\w:.*-]+)/i)?.[1];
  if (labeledScope) return labeledScope;

  if (hint && hint.length <= 160 && !hint.includes("http")) {
    return hint.trim();
  }

  return null;
}

export function providerFamilyFromPlatform(platform?: string | null): OAuthProviderFamily {
  const p = String(platform || "").toLowerCase();
  if (!p) return "generic";
  if (p === "shopify" || p === "shopify_mcp") return "shopify";
  if (p.startsWith("google") || p === "youtube" || p === "gmail") return "google";
  if (p.startsWith("meta") || p === "facebook" || p === "instagram" || p === "whatsapp") return "meta";
  if (p.startsWith("outlook") || p === "microsoft") return "microsoft";
  if (p === "tiktok") return "tiktok";
  if (p === "x") return "x";
  if (p === "canva" || p === "canva_mcp") return "canva";
  if (p === "notion") return "notion";
  if (p.startsWith("zernio")) return "zernio";
  return "generic";
}

export function oauthPermissionGuidance(args: {
  code: string;
  hint?: string | null;
  platform?: string | null;
}): OAuthPermissionGuidance | null {
  if (!isOAuthPermissionError(args.code, args.hint)) return null;

  const family = providerFamilyFromPlatform(args.platform);
  const detail = extractOAuthPermissionDetail(args.hint, args.code);

  if (family === "shopify" || args.code === "missing_shopify_permission") {
    return {
      title: "Shopify-behörighet saknas eller är inte godkänd",
      steps: [
        "Öppna Shopify Partner Dashboard → din app → Configuration → Access scopes.",
        "Ta bort ogodkända customer_*-scopes och spara appen.",
        "Kontrollera SHOPIFY_EXTRA_SCOPES i miljön — börja med read_products tills Shopify godkänt fler scopes.",
        "Koppla om butiken från E-handel eller Kopplingar.",
      ],
      dashboardLabel: "Shopify Partner Dashboard",
      dashboardUrl: "https://partners.shopify.com/",
    };
  }

  if (family === "google") {
    return {
      title: "Google-behörighet saknas",
      steps: [
        "Starta kopplingen igen och godkänn alla begärda rättigheter i Google-dialogen.",
        "Kontrollera OAuth consent screen och att rätt API:er är aktiverade i Google Cloud.",
        detail ? `Google nämnde: ${detail}.` : "Om felet kvarstår, verifiera att appen har rätt scopes i Google Cloud Console.",
      ].filter(Boolean) as string[],
      dashboardLabel: "Google Cloud Console",
      dashboardUrl: "https://console.cloud.google.com/apis/credentials",
    };
  }

  if (family === "meta") {
    return {
      title: "Meta-behörighet saknas",
      steps: [
        "Koppla om och godkänn alla permissions i Meta-dialogen.",
        "Kontrollera Meta App Dashboard → App Review / Permissions och att META_BUSINESS_SCOPES matchar godkända rättigheter.",
        detail ? `Meta nämnde: ${detail}.` : "Business Manager-kontot behöver rätt roll för ads/pages.",
      ].filter(Boolean) as string[],
      dashboardLabel: "Meta for Developers",
      dashboardUrl: "https://developers.facebook.com/apps/",
    };
  }

  if (family === "microsoft") {
    return {
      title: "Microsoft-behörighet saknas",
      steps: [
        "Koppla om Outlook/Calendar och godkänn Mail.Read / Mail.Send (eller motsvarande).",
        "Kontrollera API permissions i Azure/Entra för appen.",
        detail ? `Microsoft nämnde: ${detail}.` : undefined,
      ].filter(Boolean) as string[],
      dashboardLabel: "Azure Portal",
      dashboardUrl: "https://portal.azure.com/",
    };
  }

  if (family === "tiktok") {
    return {
      title: "TikTok-behörighet saknas",
      steps: [
        "Koppla om och godkänn user.info.basic och video.list i TikTok-portalen.",
        "Verifiera att redirect-URL och scopes matchar TikTok Developer-appen.",
        detail ? `TikTok nämnde: ${detail}.` : undefined,
      ].filter(Boolean) as string[],
      dashboardLabel: "TikTok for Developers",
      dashboardUrl: "https://developers.tiktok.com/",
    };
  }

  if (family === "zernio") {
    return {
      title: "Zernio nekade kopplingen",
      steps: [
        "Kontrollera ZERNIO_API_KEY och att plattformen ingår i ditt Zernio-abonnemang.",
        "Om felet nämner permissions/scopes, kontakta Zernio eller använd Official API om tillgängligt.",
        detail ? `Zernio: ${detail}.` : undefined,
      ].filter(Boolean) as string[],
    };
  }

  return {
    title: "Behörighet saknas hos leverantören",
    steps: [
      "Koppla om integrationen och godkänn alla begärda rättigheter.",
      "Kontrollera att OAuth-appen hos leverantören har samma scopes som servern begär.",
      detail ? `Leverantören nämnde: ${detail}.` : undefined,
    ].filter(Boolean) as string[],
  };
}

export function buildOAuthCallbackErrorQuery(
  error: unknown,
  errorDescription?: unknown,
  platform?: string | null
): string {
  const hint = errorDescription ? String(errorDescription).slice(0, 240) : "";
  const rawCode = String(error || "token_exchange_failed");
  const code = normalizeOAuthErrorCode(rawCode, hint || null);
  return `oauth_error=${encodeURIComponent(code)}${hint ? `&oauth_hint=${encodeURIComponent(hint)}` : ""}`;
}

export function connectionSyncLooksLikePermissionError(error: string): boolean {
  return SYNC_PERMISSION_PATTERN.test(error);
}

export function connectionSyncPermissionFix(platform: string, lastSyncError: string): string | null {
  if (!connectionSyncLooksLikePermissionError(lastSyncError)) return null;

  const family = providerFamilyFromPlatform(platform);
  const detail = extractOAuthPermissionDetail(lastSyncError, null);

  switch (family) {
    case "shopify":
      return detail
        ? `Saknad Shopify-behörighet (${detail}). Koppla om och godkänn scopes i Partner Dashboard.`
        : "Saknad Shopify-behörighet. Koppla om butiken och kontrollera Access scopes i Partner Dashboard.";
    case "google":
      return detail
        ? `Saknad Google-behörighet (${detail}). Koppla om och godkänn scopes i Google-konsenten.`
        : "Saknad Google-behörighet. Koppla om kontot och godkänn alla begärda API-rättigheter.";
    case "meta":
      return "Saknad Meta-behörighet. Koppla om Meta Business och godkänn ads/pages-rättigheter.";
    case "microsoft":
      return "Saknad Microsoft-behörighet. Koppla om Outlook och godkänn Mail.Read/Mail.Send.";
    default:
      return detail
        ? `Saknad behörighet (${detail}). Koppla om integrationen och godkänn alla scopes.`
        : "Saknad behörighet hos leverantören. Koppla om och godkänn alla begärda rättigheter.";
  }
}
