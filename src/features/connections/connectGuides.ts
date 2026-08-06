import type { AccountPlatform } from "@/types/accounts";
import { getApiOrigin } from "@/lib/apiBase";
import { isMcpPlatform, getMcpProviderMeta } from "./mcpProviders";

/**
 * Step-by-step connect guides.
 *
 * The catalog's one-line `connectSteps` tells you where the button is; these
 * tell you how to actually get through the provider's side of the flow —
 * which account to pick, which permission to approve, where a required id
 * lives, and what to do when it fails. Written from what the server routes in
 * `server/routes/oauth/*` genuinely require.
 */

export interface ConnectGuideStep {
  /** Imperative, one line. */
  title: string;
  /** Optional clarifying sentence. */
  detail?: string;
  /** Where this step happens, when it is outside the app. */
  link?: { label: string; href: string };
  /**
   * A value the user must paste somewhere else (e.g. an OAuth redirect URI
   * into a provider console). Rendered with a copy button.
   */
  copyValue?: string;
}

export interface ConnectGuide {
  /** Things that must already be true before starting. */
  prerequisites?: string[];
  steps: ConnectGuideStep[];
  /** What the user should see in the app once it worked. */
  result?: string;
  troubleshooting?: Array<{ problem: string; fix: string }>;
  docs?: { label: string; href: string };
}

/**
 * Absolute callback URL for a provider console. OAuth callbacks land on the
 * API origin, which differs from the app origin only in split-dev setups.
 */
export function oauthCallbackUrlForDisplay(path: string): string {
  const origin = getApiOrigin() || (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin}${path}`;
}

const ZERNIO_PICK_ACCOUNT: ConnectGuideStep = {
  title: "Välj konto hos leverantören och godkänn åtkomsten",
  detail:
    "Logga in med det konto som äger sidan eller profilen. Har du flera väljer du det i listan innan du godkänner.",
};

const BACK_IN_APP: ConnectGuideStep = {
  title: "Du skickas tillbaka till Automazing",
  detail: "Kopplingen dyker upp i listan med status Kopplad. Data synkas in inom någon minut.",
};

function zernioGuide(options: {
  label: string;
  what: string;
  result: string;
  extraFirstStep?: ConnectGuideStep;
  prerequisites?: string[];
  troubleshooting?: ConnectGuide["troubleshooting"];
}): ConnectGuide {
  return {
    prerequisites: options.prerequisites ?? [
      `Du är inloggad hos ${options.label} med ett konto som har admin-behörighet.`,
    ],
    steps: [
      ...(options.extraFirstStep ? [options.extraFirstStep] : []),
      { title: "Klicka Koppla här i listan", detail: options.what },
      ZERNIO_PICK_ACCOUNT,
      BACK_IN_APP,
    ],
    result: options.result,
    troubleshooting: options.troubleshooting ?? [
      {
        problem: "Inloggningsfönstret stängs utan att något kopplas",
        fix: "Kontot saknar admin-behörighet för sidan. Be ägaren ge dig admin, eller koppla med ägarens konto.",
      },
      {
        problem: "Kopplingen får status Koppla om efter ett tag",
        fix: "Leverantörens token har gått ut eller dragits tillbaka. Klicka Koppla om — det är normalt någon gång per år.",
      },
    ],
  };
}

const ZERNIO_INBOX_PREREQ =
  "Zernio Inbox-addonet är aktiverat i Zernio-dashboarden (krävs för DM-läsning och svar).";

const ZERNIO_INBOX_TROUBLESHOOTING = {
  problem: "”The Zernio Inbox add-on is required…” / INBOX_REQUIRED",
  fix: "Aktivera Inbox-addonet under ditt Zernio-konto (zernio.com). Utan det syns kanalen under Socialt men Meddelanden och auto-svar fungerar inte.",
};

/** Filled in as the guides below are constructed — see `guideCallbackPaths`. */
const callbackPathsInGuides = new Set<string>();

function googleOAuthGuide(options: {
  label: string;
  callbackPath: string;
  scopeNote: string;
  result: string;
  extraSteps?: ConnectGuideStep[];
  troubleshooting?: ConnectGuide["troubleshooting"];
}): ConnectGuide {
  callbackPathsInGuides.add(options.callbackPath);
  return {
    prerequisites: [
      `Ett Google-konto som har åtkomst till ${options.label}.`,
      "Servern måste ha GOOGLE_CLIENT_ID och GOOGLE_CLIENT_SECRET satta (görs en gång av administratören).",
    ],
    steps: [
      { title: "Klicka Koppla här i listan", detail: "Du skickas till Googles inloggning." },
      {
        title: "Välj rätt Google-konto",
        detail: "Använd kontot som äger datan — inte ett privat konto som bara är inbjudet som läsare.",
      },
      {
        title: "Godkänn behörigheterna",
        detail: options.scopeNote,
      },
      ...(options.extraSteps ?? []),
      BACK_IN_APP,
    ],
    result: options.result,
    // The redirect_uri hint always applies to a Google flow, so callers add to
    // it rather than replace it — losing it is what makes these fail silently.
    troubleshooting: [
      {
        problem: "”Access blocked” eller redirect_uri_mismatch från Google",
        fix: `Callback-URL:en saknas i Google Cloud-projektet. Lägg till exakt denna under OAuth-klientens Authorized redirect URIs: ${oauthCallbackUrlForDisplay(options.callbackPath)}`,
      },
      ...(options.troubleshooting ?? [
        {
          problem: "Kopplingen lyckas men ingen data syns",
          fix: "Google-kontot saknar åtkomst till resursen. Kontrollera behörigheterna hos Google och koppla om.",
        },
      ]),
    ],
    docs: { label: "Google Cloud Console", href: "https://console.cloud.google.com/apis/credentials" },
  };
}

const GUIDES: Partial<Record<AccountPlatform, ConnectGuide>> = {
  instagram: zernioGuide({
    label: "Instagram",
    what: "Instagram kopplas via Zernio, som sköter Metas inloggning åt dig.",
    result: "Inlägg och statistik dyker upp under Socialt, och DM:en hamnar i Meddelanden.",
    prerequisites: [
      "Du är inloggad hos Instagram med ett konto som har admin-behörighet.",
      ZERNIO_INBOX_PREREQ,
    ],
    extraFirstStep: {
      title: "Kontrollera att kontot är ett företags- eller skaparkonto",
      detail:
        "Privata Instagram-konton kan inte kopplas. Byt i Instagram-appen under Inställningar → Kontotyp om det behövs.",
      link: {
        label: "Så byter du kontotyp",
        href: "https://help.instagram.com/502981923235522",
      },
    },
    troubleshooting: [
      ZERNIO_INBOX_TROUBLESHOOTING,
      {
        problem: "Inloggningsfönstret stängs utan att något kopplas",
        fix: "Kontot saknar admin-behörighet för sidan. Be ägaren ge dig admin, eller koppla med ägarens konto.",
      },
    ],
  }),
  facebook: zernioGuide({
    label: "Facebook",
    what: "Facebook-sidan kopplas via Zernio.",
    result: "Sidans inlägg syns under Socialt och meddelanden i Meddelanden.",
    prerequisites: [
      "Du är inloggad hos Facebook med ett konto som har admin-behörighet.",
      ZERNIO_INBOX_PREREQ,
    ],
    extraFirstStep: {
      title: "Ta reda på vilken sida du vill koppla",
      detail: "Det är sidan som ska kopplas, inte din personliga profil.",
    },
    troubleshooting: [ZERNIO_INBOX_TROUBLESHOOTING],
  }),
  whatsapp: zernioGuide({
    label: "WhatsApp Business",
    what: "WhatsApp Business kopplas via Zernio.",
    result: "Konversationer hamnar i Meddelanden. Utskick kräver godkända mallar hos Meta.",
    prerequisites: [
      "Du är inloggad hos WhatsApp Business med ett konto som har admin-behörighet.",
      ZERNIO_INBOX_PREREQ,
    ],
    troubleshooting: [ZERNIO_INBOX_TROUBLESHOOTING],
  }),
  tiktok: zernioGuide({
    label: "TikTok",
    what: "TikTok kopplas via Zernio som standard. Official API finns som alternativ.",
    result: "Videor och statistik syns under Socialt.",
    troubleshooting: [
      {
        problem: "Följarantal och visningar saknas",
        fix: "TikTok kräver att scopen user.info.stats och video.list är godkända för appen i TikTok Developer Portal. Det är en portal-åtgärd som administratören gör en gång.",
      },
    ],
  }),
  google_business: {
    prerequisites: [
      "Företagsprofilen är verifierad hos Google och ditt konto är ägare eller administratör.",
    ],
    steps: [
      {
        title: "Välj väg: Official API rekommenderas",
        detail:
          "Official API ger fullständig profilinformation. Zernio finns som alternativ om Google-vägen inte går att använda.",
      },
      { title: "Klicka Koppla (rekommenderat)", detail: "Du skickas till Googles inloggning." },
      {
        title: "Välj Google-kontot som administrerar företagsprofilen",
        detail: "Ett konto som bara är inbjudet som läsare räcker inte.",
      },
      { title: "Godkänn åtkomst till Business Profile", detail: "Automazing läser profil och omdömen." },
      BACK_IN_APP,
    ],
    result: "Företagsuppgifter och omdömen syns under Recensioner och Socialt.",
    troubleshooting: [
      {
        problem: "”Inget Business Profile-konto tillgängligt”",
        fix: "Google-kontot äger ingen företagsprofil. Koppla med ägarens konto, eller be om administratörsroll i Business Profile Manager.",
      },
      {
        problem: "Konto hittas men inga platser",
        fix: "Platsen är inte claimad eller inte delad med kontot. Kontrollera i Business Profile Manager.",
      },
    ],
    docs: { label: "Google Business Profile Manager", href: "https://business.google.com/" },
  },
  youtube: googleOAuthGuide({
    label: "YouTube-kanalen",
    callbackPath: "/api/auth/youtube/callback",
    scopeNote: "Automazing läser kanalens videor och statistik. Inget publiceras utan att du ber om det.",
    result: "Kanalens videor och engagemang syns under Socialt.",
  }),
  gmail: googleOAuthGuide({
    label: "Gmail-kontot",
    callbackPath: "/api/auth/gmail/callback",
    scopeNote: "Automazing läser och skickar mail för din räkning så inkorgen fungerar i appen.",
    result: "Mailen hamnar i Meddelanden och du kan svara direkt därifrån.",
  }),
  google_drive: googleOAuthGuide({
    label: "Google Drive",
    callbackPath: "/api/auth/google_drive/callback",
    scopeNote: "Automazing läser filer och mappar för att kunna visa och återanvända ditt material.",
    result: "Dina filer syns under Innehåll och kan användas i inlägg.",
  }),
  google_calendar: googleOAuthGuide({
    label: "Google Calendar",
    // The route is registered with a hyphen — see googleCalendarOAuthRoutes.ts.
    callbackPath: "/api/auth/google-calendar/callback",
    scopeNote: "Automazing läser och skapar händelser i den kalender du väljer.",
    result: "Händelserna syns under Kalender.",
    troubleshooting: [
      {
        problem: "Kopplingen lyckas men kalendern är tom",
        fix: "Använd Google official (standard). Zernio-vägen kopplar kontot men returnerar ofta inga händelser på nuvarande planer.",
      },
    ],
  }),
  google_reviews: googleOAuthGuide({
    label: "företagsprofilens omdömen",
    callbackPath: "/api/auth/google-reviews/callback",
    scopeNote: "Automazing läser omdömen och publicerar de svar du godkänner.",
    result: "Omdömena hamnar under Recensioner med AI-utkast till svar.",
    troubleshooting: [
      {
        problem: "”Inget Business Profile-konto tillgängligt”",
        fix: "Kontot äger ingen företagsprofil. Koppla med ägarens Google-konto.",
      },
      {
        problem: "Konto hittas men inga platser",
        fix: "Platsen är inte claimad eller delad med kontot. Kontrollera i Business Profile Manager.",
      },
      {
        problem: "Kopplad via Zernio men inga omdömen",
        fix: "Välj Google official istället. Zernios reviews-endpoints svarar 404 på många planer — Official Business Profile OAuth är den fungerande vägen.",
      },
    ],
  }),
  google_ads: {
    prerequisites: [
      "Ett Google-konto med åtkomst till Google Ads-kontot.",
      "Administratören har satt GOOGLE_ADS_DEVELOPER_TOKEN och GOOGLE_ADS_CUSTOMER_ID.",
    ],
    steps: [
      { title: "Klicka Koppla (rekommenderat)", detail: "Official API ger kampanjdata och ROAS." },
      { title: "Välj Google-kontot som har åtkomst till annonskontot" },
      { title: "Godkänn läsåtkomst till Google Ads" },
      {
        title: "Fyll i kund-id om det inte redan är satt",
        detail:
          "Google Ads kund-id står uppe till höger i Google Ads (tio siffror). Ange det utan bindestreck under Inställningar → API-nycklar.",
        link: { label: "Öppna Google Ads", href: "https://ads.google.com/" },
      },
      BACK_IN_APP,
    ],
    result: "Kampanjer, spend och ROAS syns under Marknadsföring.",
    troubleshooting: [
      {
        problem: "Kopplingen lyckas men inga kampanjer syns",
        fix: "Utvecklartoken eller kund-id saknas. Båda krävs för att läsa kampanjdata — kontrollera Inställningar → API-nycklar.",
      },
    ],
  },
  meta_business: {
    prerequisites: ["Du är administratör i Meta Business Manager för kontot."],
    steps: [
      { title: "Klicka Koppla här i listan", detail: "Du skickas till Metas inloggning." },
      { title: "Välj Business Manager-konto och annonskonto" },
      { title: "Godkänn läsåtkomst till annonsdata" },
      BACK_IN_APP,
    ],
    result: "Meta-kampanjer syns under Marknadsföring tillsammans med Google Ads.",
    troubleshooting: [
      {
        problem: "”Platform not supported” från Zernio",
        fix: "Meta Business går bara via Official API i den här installationen. Använd Koppla-knappen här, inte Zernio-vägen.",
      },
    ],
  },
  x: {
    prerequisites: ["Ett X-konto och att administratören satt X_CLIENT_ID och X_CLIENT_SECRET."],
    steps: [
      { title: "Klicka Koppla här i listan" },
      { title: "Logga in på X och godkänn åtkomsten" },
      BACK_IN_APP,
    ],
    result: "Dina inlägg och engagemang syns under Socialt.",
    troubleshooting: [
      {
        problem: "Statistik saknas för inlägg",
        fix: "Utökad statistik kräver en betald X API-nivå. Grundläggande profil- och inläggsdata fungerar ändå.",
      },
    ],
  },
  shopify: {
    prerequisites: ["Du är ägare eller administratör i butiken."],
    steps: [
      {
        title: "Ta reda på butikens permanenta domän",
        detail:
          "Den slutar alltid på .myshopify.com och ändras aldrig, till skillnad från din publika domän. Finns i Shopify admin under Inställningar → Domäner.",
        link: { label: "Öppna Shopify admin", href: "https://admin.shopify.com/" },
      },
      {
        title: "Klicka Koppla och klistra in domänen",
        detail: "Du kan även klistra in en admin-länk som admin.shopify.com/store/mystore — den tolkas automatiskt.",
      },
      { title: "Godkänn appens behörigheter i Shopify" },
      BACK_IN_APP,
    ],
    result: "Ordrar, produkter och lagersaldo syns under E-handel och driver lagervarningarna.",
    troubleshooting: [
      {
        problem: "”Butiksadressen är inte en giltig Shopify-butik”",
        fix: "Du angav din publika domän. Använd .myshopify.com-adressen från Inställningar → Domäner.",
      },
      {
        problem: "Shopify nekar en behörighet",
        fix: "Appen begär ett scope som inte är godkänt. Administratören tar bort scopet i Shopify Partner Dashboard, eller kopplar med read_products först.",
      },
    ],
    docs: { label: "Shopify: om butiksdomäner", href: "https://help.shopify.com/en/manual/domains" },
  },
  judgeme: {
    prerequisites: [
      "Judge.me är installerat i butiken och du kommer åt Judge.me admin.",
      "Butikens permanenta domän (samma .myshopify.com-adress som Shopify använder).",
    ],
    steps: [
      {
        title: "Hämta din privata API-token",
        detail:
          "I Judge.me admin: Settings → Integrations → knappen View API tokens uppe till höger. Kopiera den privata token, inte den publika.",
        link: { label: "Öppna Judge.me admin", href: "https://judge.me/login" },
      },
      {
        title: "Klicka Koppla och fyll i domän och token",
        detail: "Uppgifterna testas mot Judge.me direkt — får du inget felmeddelande är de korrekta.",
      },
      {
        title: "Öppna Recensioner",
        detail: "Recensionerna läses in med betyg, kundbilder och märkning för verifierade köp.",
      },
    ],
    result: "Recensionerna syns under Recensioner, och du kan skicka recensionsförfrågningar därifrån.",
    troubleshooting: [
      {
        problem: "”Judge.me avvisade uppgifterna”",
        fix: "Oftast fel token-typ. Den publika token kan bara läsa widgets — kopiera den privata.",
      },
      {
        problem: "Svarsknappen heter Kopiera svar istället för Skicka",
        fix: "Det är avsiktligt. Judge.me:s API kan inte publicera svar, så svaret kopieras och klistras in i Judge.me admin under Reviews → Manage reviews.",
      },
    ],
    docs: { label: "Judge.me API-dokumentation", href: "https://judge.me/api/docs" },
  },
  tripadvisor: {
    prerequisites: ["En API-nyckel från Tripadvisor Content API och platsens location-id."],
    steps: [
      {
        title: "Skaffa en Content API-nyckel",
        detail: "Registrera dig i Tripadvisors utvecklarportal och skapa en nyckel för Content API.",
        link: { label: "Tripadvisor Developer Portal", href: "https://developer-tripadvisor.com/content-api/" },
      },
      {
        title: "Hitta platsens location-id",
        detail:
          "Öppna platsens sida på Tripadvisor och titta i adressfältet: siffrorna direkt efter -d är location-id (t.ex. …-d304554-…).",
      },
      {
        title: "Klicka Koppla (Tripadvisor official) och fyll i uppgifterna",
        detail: "Har du redan sparat nyckeln under Inställningar → API-nycklar räcker det med location-id. Zernio är ett reservalternativ.",
      },
    ],
    result: "Omdömen, platsinformation och foton syns under Recensioner.",
    troubleshooting: [
      {
        problem: "Tripadvisor nekar nyckeln",
        fix: "Content API-nycklar är ofta låsta till vissa domäner eller IP-adresser. Kontrollera begränsningarna i utvecklarportalen.",
      },
      {
        problem: "Kopplad via Zernio men saknar omdömen",
        fix: "Byt till Tripadvisor official med Content API-nyckel + location-id — det är standardvägen.",
      },
    ],
  },
  fortnox: {
    prerequisites: ["Ett Fortnox-konto med rätt att godkänna integrationer."],
    steps: [
      { title: "Klicka Koppla här i listan", detail: "Du skickas till Fortnox inloggning." },
      { title: "Logga in och godkänn åtkomsten", detail: "Automazing läser fakturor och skapar underlag du godkänner." },
      {
        title: "Kontrollera resultatet under Företag → Ekonomi",
        detail: "Fakturor och ekonomiöversikt ska synas där direkt efter kopplingen.",
      },
    ],
    result: "Fakturor, betalningar och leverantörsfakturor hanteras under Företag → Ekonomi.",
    troubleshooting: [
      {
        problem: "Fakturaförslag skapas men inget skickas till Fortnox",
        fix: "Det är avsiktligt: allt som skapar ekonomiska poster kräver att du klickar godkänn. Inget bokförs automatiskt.",
      },
    ],
    docs: { label: "Fortnox utvecklarportal", href: "https://developer.fortnox.se/" },
  },
  notion: {
    prerequisites: ["Ett Notion-konto med åtkomst till arbetsytan."],
    steps: [
      { title: "Klicka Koppla här i listan" },
      {
        title: "Välj arbetsyta och vilka sidor integrationen får läsa",
        detail: "Notion delar bara det du uttryckligen väljer — glöm inte att bocka i sidorna du vill använda.",
      },
      BACK_IN_APP,
    ],
    result: "Valda Notion-sidor blir tillgängliga i appen.",
    troubleshooting: [
      {
        problem: "Inga sidor syns efter kopplingen",
        fix: "Ingen sida delades i behörighetssteget. Koppla om och markera sidorna, eller dela dem med integrationen i Notion.",
      },
    ],
  },
  outlook: {
    prerequisites: ["Ett Microsoft-konto (privat eller arbetskonto)."],
    steps: [
      { title: "Klicka Koppla här i listan" },
      { title: "Logga in med Microsoft och godkänn åtkomsten", detail: "Automazing läser och skickar mail åt dig." },
      BACK_IN_APP,
    ],
    result: "Mailen hamnar i Meddelanden tillsammans med Gmail.",
    troubleshooting: [
      {
        problem: "Arbetskontot kräver godkännande av en administratör",
        fix: "Be er Microsoft 365-administratör godkänna appen för organisationen, sedan fungerar inloggningen.",
      },
    ],
  },
  outlook_calendar: {
    prerequisites: ["Ett Microsoft-konto med kalender."],
    steps: [
      {
        title: "Klicka Koppla (Microsoft official)",
        detail: "Standardvägen. Zernio finns som alternativ men returnerar ofta tom kalender.",
      },
      { title: "Logga in med Microsoft och godkänn kalenderåtkomst" },
      BACK_IN_APP,
    ],
    result: "Händelserna syns under Kalender.",
    troubleshooting: [
      {
        problem: "Kopplingen lyckas men kalendern är tom",
        fix: "Använd Microsoft official. Zernio-vägen kopplar kontot men synkar ofta inga händelser.",
      },
    ],
  },
  canva: {
    prerequisites: ["Ett Canva-konto. Varumärkesmallar kräver Canva Pro."],
    steps: [
      { title: "Klicka Koppla här i listan", detail: "Canva Connect öppnas." },
      { title: "Godkänn att Automazing får läsa och exportera designer" },
      {
        title: "Testa med en export",
        detail: "Gå till Socialt → Skapa och exportera en bild för att bekräfta att kopplingen fungerar.",
      },
    ],
    result: "Dina designer och varumärkesmallar kan användas när du skapar inlägg.",
  },
};

/** Shared guide for the remote MCP data providers — they behave alike. */
function mcpGuide(platform: AccountPlatform, label: string): ConnectGuide {
  const meta = getMcpProviderMeta(platform);
  if (meta?.auth === "oauth") {
    return {
      prerequisites: [`Ett konto hos ${label}.`],
      steps: [
        { title: "Klicka Koppla här i listan", detail: `Du skickas till ${label} för inloggning.` },
        { title: "Logga in och godkänn åtkomsten" },
        {
          title: "Kontrollera under Intelligence",
          detail: "Leverantörens verktyg listas där när kopplingen är klar.",
        },
      ],
      result: `${label} blir tillgängligt som datakälla under Intelligence.`,
      troubleshooting: [
        {
          problem: "Inloggningen misslyckas direkt",
          fix: "Leverantören kräver ibland att appen registreras först. Försök igen — registreringen sker automatiskt vid första försöket.",
        },
      ],
    };
  }
  if (meta?.auth === "keyless") {
    return {
      steps: [
        { title: "Klicka Koppla", detail: "Ingen inloggning behövs — tjänsten är öppen." },
        { title: "Kontrollera under Intelligence", detail: "Verktygen listas där direkt." },
      ],
      result: `${label} blir tillgängligt som datakälla under Intelligence.`,
    };
  }
  if (meta?.auth === "shop_domain") {
    return {
      steps: [
        {
          title: "Ta reda på butikens .myshopify.com-domän",
          detail: "Samma permanenta domän som Shopify-kopplingen använder.",
        },
        { title: "Klicka Koppla och klistra in domänen" },
      ],
      result: `${label} blir tillgängligt som datakälla under Intelligence.`,
    };
  }
  return {
    prerequisites: [`En API-nyckel från ${label}.`],
    steps: [
      {
        title: `Hämta en API-nyckel i ditt ${label}-konto`,
        detail: "Nyckeln finns normalt under kontoinställningar eller utvecklarsektionen.",
      },
      { title: "Klicka Koppla och klistra in nyckeln", detail: "Nyckeln lagras krypterad per företagsprofil." },
      { title: "Kontrollera under Intelligence", detail: "Verktygen listas där när nyckeln accepterats." },
    ],
    result: `${label} blir tillgängligt som datakälla under Intelligence.`,
    troubleshooting: [
      {
        problem: "Nyckeln avvisas",
        fix: "Kontrollera att du kopierat hela nyckeln utan mellanslag, och att den inte är begränsad till andra domäner.",
      },
    ],
  };
}

export function getConnectGuide(platform: AccountPlatform, label: string): ConnectGuide | null {
  const guide = GUIDES[platform];
  if (guide) return guide;
  if (isMcpPlatform(platform)) return mcpGuide(platform, label);
  return null;
}

/** Cheap check for "is there anything to show" without building the guide. */
export function hasConnectGuide(platform: AccountPlatform): boolean {
  return Boolean(GUIDES[platform]) || isMcpPlatform(platform);
}

/**
 * Every OAuth callback path a guide asks the user to paste into a provider
 * console, collected as the guides are built. A test asserts these still match
 * the routes the server registers — a stale path here hands the user a
 * redirect_uri that will never fire.
 */
export function guideCallbackPaths(): string[] {
  return [...callbackPathsInGuides].sort();
}
