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
  meta_business_not_configured:
    "Meta Business official saknar app-ID eller app-secret. Lägg till META_APP_ID och META_APP_SECRET i API-inställningar och kontrollera callback-URL:en i Meta-appen.",
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
  if (merged[details.code]) return merged[details.code];
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
    typeof params.payload?.error === "string" && params.payload.error.trim().length > 0
      ? params.payload.error
      : params.fallbackMessage;
  const exception =
    typeof params.payload?.exception === "string" && params.payload.exception.trim().length > 0
      ? params.payload.exception
      : "ej angiven";

  return `Fel: ${errorCode} | Status: ${statusCode} | Undantag: ${exception}`;
}
