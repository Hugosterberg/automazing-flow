import { isNonEmptyString } from "@/lib/utils";

export type OAuthErrorDetails = {
  code: string;
  statusCode: string | null;
  exception: string | null;
  hint: string | null;
};

/** Visas när sidor inte definierar egna meddelanden — utöka med per-sida-mappar för override. */
export const DEFAULT_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated:
    "Inloggningssessionen saknades när OAuth slutfördes. Öppna appen igen, håll dig inloggad och starta Koppla-flödet på nytt från samma sida.",
  access_denied:
    "Leverantören nekade åtkomst. Försök koppla igen och godkänn de begärda behörigheterna.",
  invalid_state:
    "OAuth-tillståndet matchar inte — länken kan ha gått ut, en annan flik interfererade, eller cookie-inställningarna blockerade svaret. Starta Koppla-flödet igen från en enda flik.",
  user_cancelled:
    "Inloggningen avbröts hos leverantören. Försök igen när du är redo att godkänna åtkomst.",
  interaction_required:
    "Leverantören kräver ett extra inloggningssteg. Försök koppla igen och slutför alla dialogrutor.",
  token_exchange_failed:
    "Kunde inte byta ut auktoriseringskoden mot en token. Kontrollera att OAuth-nycklar och callback-URL:er är korrekt konfigurerade.",
  missing_code:
    "Leverantören skickade inget auktoriseringskod. Försök igen — om problemet kvarstår, kontrollera konfigurationen.",
  scope_not_granted:
    "Appen fick inte alla nödvändiga behörigheter. Försök koppla igen och markera alla efterfrågade rättigheter.",
  account_already_connected:
    "Det här kontot är redan kopplat till en annan profil.",
  gmail_not_configured:
    "Gmail-kopplingen saknar Google OAuth-konfiguration. Kontrollera GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET och att callback-URL:en för Gmail finns i Google Cloud.",
  outlook_not_configured:
    "Outlook-kopplingen saknar Microsoft OAuth-konfiguration. Kontrollera MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET och callback-URL:en i Azure/Entra.",
  google_drive_not_configured:
    "Google Drive-kopplingen saknar Google OAuth-konfiguration. Kontrollera GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET och Drive-callbacken i Google Cloud.",
  canva_not_configured:
    "Canva-kopplingen saknar Canva Connect-konfiguration. Kontrollera CANVA_CLIENT_ID, CANVA_CLIENT_SECRET och callback-URL:en i Canva Developer Portal.",
  google_calendar_not_configured:
    "Google Calendar saknar Google OAuth-konfiguration. Kontrollera GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET och Calendar-callbacken i Google Cloud.",
  outlook_calendar_not_configured:
    "Outlook Calendar saknar Microsoft OAuth-konfiguration. Kontrollera MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET och callback-URL:en i Azure/Entra.",
  google_business_not_configured:
    "Google Business official saknar Google OAuth-konfiguration. Kontrollera GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET och att Google Business Profile API är aktiverat.",
  google_business_accounts_api_failed:
    "Google Business kunde inte läsa konton från Google. Kontrollera att Google Business Profile API är aktiverat och att kontot har åtkomst till företagsprofilen.",
  google_business_locations_api_failed:
    "Google Business kunde inte läsa platser från Google. Kontrollera att kontot har åtkomst till minst en verifierad plats och att Business Information API är aktiverat.",
  google_business_no_account_access:
    "Google-kontot har ingen åtkomst till ett Google Business-konto. Koppla med ett konto som äger eller administrerar företagsprofilen.",
  google_business_no_location_access:
    "Google-kontot har ingen åtkomst till någon Google Business-plats. Kontrollera behörigheter och att platsen finns i Business Profile Manager.",
  google_reviews_not_configured:
    "Google Reviews saknar Google OAuth-konfiguration. Kontrollera GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET och att Google Business Profile API är aktiverat.",
  tripadvisor_not_configured:
    "Tripadvisor official saknar API-nyckel eller location-id. Lägg till TRIPADVISOR_API_KEY och TRIPADVISOR_LOCATION_ID i miljön eller under Preferences - API keys.",
  shopify_not_configured:
    "Shopify-kopplingen saknar app-konfiguration. Kontrollera SHOPIFY_API_KEY, SHOPIFY_API_SECRET och callback-URL:en i Shopify-appen.",
  shopify_missing_shop:
    "Shopify kräver en butiksdomän. Ange den som mystore.myshopify.com och försök igen.",
  missing_shopify_permission:
    "Shopify nekade en app-permission som OAuth-kopplingen bad om. Be app-operatören ta bort icke godkända Shopify-scopes eller godkänna permissionen i Shopify Partner Dashboard.",
  shopify_shop_mismatch:
    "Shopify svarade med en annan butiksdomän än den du startade med. Starta kopplingen igen och kontrollera domänen.",
  notion_not_configured:
    "Notion-kopplingen saknar OAuth-konfiguration. Kontrollera NOTION_CLIENT_ID, NOTION_CLIENT_SECRET och callback-URL:en i Notion-integrationen.",
  youtube_not_configured:
    "YouTube-kopplingen saknar Google OAuth-konfiguration. Kontrollera GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET och YouTube-scope/callback.",
  tiktok_not_configured:
    "TikTok-kopplingen saknar OAuth-konfiguration. Kontrollera TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET och redirect-URL:en i TikTok-portalen.",
  x_not_configured:
    "X-kopplingen saknar OAuth-konfiguration. Kontrollera X_CLIENT_ID, X_CLIENT_SECRET och callback-URL:en i X Developer Portal.",
  invalid_pkce_state:
    "OAuth PKCE-state saknas eller är ogiltigt. Starta kopplingen på nytt från Connections i en enda flik.",
  meta_business_not_configured:
    "Meta Business official saknar app-ID eller app-secret. Lägg till META_APP_ID och META_APP_SECRET i API-inställningar och kontrollera callback-URL:en i Meta-appen.",
  google_ads_not_configured:
    "Google Ads saknar Google OAuth-konfiguration. Kontrollera GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET och Google Ads API-inställningarna.",
  zernio_not_configured:
    "Zernio är inte konfigurerat. Lägg till ZERNIO_API_KEY och koppla en Zernio-profil eller använd Official API om plattformen stödjer det.",
  zernio_profile_failed:
    "Zernio-profilen kunde inte hittas eller skapas för den aktiva företagsprofilen. Kontrollera business profile-kopplingen och Zernio-inställningarna.",
  zernio_connect_failed:
    "Zernio avvisade connect-förfrågan. Kontrollera API-nyckeln, att plattformen stöds i Zernio och att profilen har rätt behörigheter.",
  zernio_no_auth_url:
    "Zernio returnerade ingen inloggningslänk. Testa igen eller använd Official API om det finns som alternativ.",
  zernio_gmb_not_supported:
    "Zernio stöder inte Google Business i detta workspace. Använd Official API för Google Business.",
  zernio_init_failed:
    "Zernio kunde inte starta kopplingen. Testa Official API om det finns som alternativ, eller kontrollera ZERNIO_API_KEY och ZERNIO_PROFILE_ID.",
  zernio_fetch_failed:
    "Servern kunde inte nå Zernios connect-endpoint. Det kan bero på Zernio-driftstörning, fel ZERNIO_API_BASE eller att plattformen inte stöds i ditt Zernio-konto. Testa Official API för Meta Business om Zernio fortsätter misslyckas.",
  zernio_platform_not_supported:
    "Zernio stödjer inte den här plattformen i ditt workspace. Använd official API-kopplingen istället.",
};

export function parseOAuthErrorDetails(searchParams: URLSearchParams): OAuthErrorDetails | null {
  const code = searchParams.get("oauth_error");
  if (!code) return null;
  return {
    code,
    statusCode: searchParams.get("oauth_status"),
    exception: searchParams.get("oauth_exception"),
    hint: searchParams.get("oauth_hint"),
  };
}

export function removeOAuthErrorParams(searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams);
  next.delete("oauth_error");
  next.delete("oauth_status");
  next.delete("oauth_exception");
  next.delete("oauth_hint");
  return next;
}

export function formatOAuthErrorMessage(
  details: OAuthErrorDetails,
  messages?: Record<string, string>,
  fallbackPrefix = "Koppling misslyckades"
) {
  const merged = { ...DEFAULT_OAUTH_ERROR_MESSAGES, ...(messages || {}) };
  if (merged[details.code]) {
    if (details.code === "missing_shopify_permission" && details.hint) {
      return `${merged[details.code]} Shopify rapporterade: ${details.hint}.`;
    }
    return merged[details.code];
  }
  // Humanize the error code for the fallback
  const humanCode = details.code.replace(/_/g, " ");
  return `${fallbackPrefix}: ${humanCode}`;
}

export function formatConnectFetchError(params: {
  status?: number;
  payload?: { error?: unknown; exception?: unknown; status?: unknown } | null;
  fallbackMessage: string;
}) {
  const statusCode =
    typeof params.payload?.status === "number"
      ? String(params.payload.status)
      : typeof params.status === "number"
        ? String(params.status)
        : "okänd";
  const errorCode =
    isNonEmptyString(params.payload?.error)
      ? params.payload.error
      : params.fallbackMessage;
  const exception =
    isNonEmptyString(params.payload?.exception)
      ? params.payload.exception
      : "ej angiven";

  return `Fel: ${errorCode} | Status: ${statusCode} | Undantag: ${exception}`;
}
