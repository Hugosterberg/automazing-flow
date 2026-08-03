# Kopplade konton – översikt

Det här projektet pratar med **din backend** (`server/server.js`, port 3001). Frontend proxar `/api` dit i utveckling.

## Zernio (ett API, flera användningar)

**Zernio** ([zernio.com](https://zernio.com)) används till:

| Vad | Hur i appen |
|-----|----------------|
| **Instagram-inloggning** | Sidomeny → Connect more → **Instagram**. Öppnar Zernios OAuth-flöde. |
| **Facebook, WhatsApp, Google Business m.fl.** | Sidomeny → Connect more → välj kanal eller **All Zernio channels…**. Listar konton från Zernio; du väljer vilket som ska länkas. |

**Miljövariabler** (i `.env.local` lokalt):

- `ZERNIO_API_KEY` – krävs för båda ovan.  
- `ZERNIO_PROFILE_ID` – valfritt (workspace/profil i Zernio).  
- `ZERNIO_API_BASE` – valfritt, standard är `https://zernio.com/api/v1`.

Om du fortfarande har `LATE_API_KEY` i en gammal env-fil använder servern den automatiskt tills du byter namn till `ZERNIO_API_KEY`.

Du måste först koppla kanalerna i **Zernio-dashboarden**; appen hämtar sedan listan via API.

## Övriga plattformar

- **TikTok, YouTube, X** – klassisk OAuth mot respektive plattform (egna nycklar i `.env.local` lokalt).
- **Instagram utan Zernio** – `INSTAGRAM_CLIENT_ID` / `INSTAGRAM_CLIENT_SECRET` (Meta), om du inte sätter `ZERNIO_API_KEY`.
- **Shopify (lokal utveckling via tunnel)** – sätt `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` och `SHOPIFY_APP_URL` (publik HTTPS-host, t.ex. tunnel-domän).
- **Notion** – sätt `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` och `NOTION_APP_URL` (publik HTTPS-host för OAuth callback).
- **Reviews (Google + Tripadvisor)** – ny flik. Google Reviews kan kopplas via Zernio eller officiell Google Business OAuth (`business.manage`). Tripadvisor går via Zernio, eller officiell API med `TRIPADVISOR_API_KEY` + `TRIPADVISOR_LOCATION_ID`.

## Shopify i lokal utveckling (tunnel)

För Shopify OAuth måste callback vara publik HTTPS, även om backend kör lokalt.

- Lokal backend: `http://localhost:3001`
- Publik app-host: `https://<din-tunnel-domän>`
- Shopify **Application URL**: `https://<din-tunnel-domän>`
- Shopify **Allowed redirection URL**: `https://<din-tunnel-domän>/api/auth/shopify/callback`

Servern använder `SHOPIFY_APP_URL` för Shopify `redirect_uri` och skickar sedan tillbaka användaren till `BASE_URL` (din lokala frontend).

## Nyckelmodell: globala plattformsnycklar vs per-profil-secrets

Det finns två lager av nycklar:

1. **Globala plattformsnycklar (env, ägs av plattformsoperatören).** OAuth-app-credentials
   (`GOOGLE_CLIENT_ID/SECRET`, Meta/TikTok/X/Shopify/Notion/Microsoft), `ZERNIO_API_KEY`,
   `OPENAI_API_KEY`, `SUPABASE_*`, `CRON_SECRET`, m.fl. Sätts som miljövariabler lokalt i `.env.local`
   och i Vercel. **Preferences kan bara visa status (configured/missing) — aldrig värden, och skriver
   dem inte.** En OAuth-app registreras en gång; varje användare loggar bara in sitt eget konto i den.

2. **Per-profil-secrets (krypterade i Supabase).** "Bring-your-own"-nycklar som hör till en enskild
   företagsprofil: Tripadvisor `location_id` + ev. egen nyckel, Google Ads `customer_id`, ev. egen
   `OPENAI_API_KEY`/`PAGESPEED_API_KEY`. Fylls i under **Preferences → Integrations** per aktiv profil.
   Krypteras med AES-256-GCM (`server/lib/secretCrypto.ts`) och lagras i `integration_secrets`.
   Servern löser upp nycklar som **per-profil → global env** (`server/lib/secretResolver.ts`), så att
   inget slutar fungera när en profil saknar egen nyckel.

**Ny miljövariabel:** `SECRETS_ENCRYPTION_KEY` (32 byte, t.ex. `openssl rand -base64 32`) krävs för att
per-profil-secrets ska kunna lagras. Sätt den lokalt **och** i Vercel. Saknas den (eller
`SUPABASE_SERVICE_ROLE_KEY`) faller allt tillbaka på globala env-nycklar.

## Zernio: en nyckel, en profil per företag

`ZERNIO_API_KEY` är **en** global nyckel som täcker alla profiler. Varje företagsprofil får en egen
Zernio-*profil* (workspace) som skapas på begäran och sparas i `business_profiles.zernio_profile_id`, så
att en kunds kanaler/inbox hålls isolerade inom din enda Zernio-nyckel.

## Auto-svar på DM:s (automation)

Varje profil kan slå på **auto-svar** under **Preferences → Automation**:

- **Utkast-läge (standard):** AI:n läser olästa Zernio-inbox-konversationer (Instagram/Facebook/WhatsApp)
  och skriver svarsförslag som loggas i automationsloggen — inget skickas automatiskt. Varje utkast har
  en "Skicka svaret"-knapp i loggen för granskat utskick.
- **Skicka automatiskt:** AI:n skickar svaret direkt via Zernio (`/inbox/send`).

Inställningarna (på/av, läge, ton, språk, extra instruktioner) lagras per profil i
`automation_settings`. Varje hanterat meddelande loggas i `auto_reply_log` med en unik nyckel per
inkommande meddelande — det är idempotensvakten som gör att samma meddelande aldrig besvaras två
gånger, även om jobbet körs ofta.

**Körning:**

- **Manuellt:** knappen "Kör nu" i Preferences → Automation (kör för aktiv profil).
- **Schemalagt:** `GET /api/cron/auto-reply` med `Authorization: Bearer <CRON_SECRET>`. Schemalagt
  via GitHub Actions (`.github/workflows/auto-reply-cron.yml`, var 15:e minut) eftersom Vercel Hobby
  bara tillåter 2 dagliga cron-jobb. Kräver repo-secret `CRON_SECRET` (samma värde som på Vercel)
  och repo-variabel `CRON_BASE_URL` (produktions-URL:en) under Settings → Secrets and variables →
  Actions; tills de är satta hoppar jobbet över körningen med en notis. Alternativ: lägg till i
  `vercel.json` under `crons` (kräver Vercel Pro) eller annan extern schemaläggare (cron-job.org).

AI-svaren använder per-profil-`OPENAI_API_KEY` (integration_secrets) med global env-fallback; utan
nyckel används en enkel standardtext. Kräver `SUPABASE_SERVICE_ROLE_KEY` (för settings/logg) och
`ZERNIO_API_KEY`.

**Viktigt (verifierat 2026-06-11):** Zernios inbox-API kräver **Inbox-addonet** på Zernio-kontot.
Utan det svarar `/inbox/*` med `403 INBOX_REQUIRED` — appen visar då "The Zernio Inbox add-on is
required…" i Messages och i automationens körsammanfattning. Aktivera addonet i Zernio-dashboarden
för att DM-läsning, DM-svar och auto-svar ska fungera. Zernios reviews-endpoints
(`/reviews`, `/google-business/reviews` m.fl.) svarade 404 vid samma test — recensioner via Zernio
är inte tillgängligt på nuvarande plan; Google Reviews fungerar via officiell Google Business OAuth.

## Profiltyper: företag och privat

En användare kan ha flera profiler i samma app — t.ex. en per företag och en för privatlivet.
`business_profiles.kind` (`company` | `personal`) styr endast etiketter, ikoner och AI-standarder;
all multitenant-logik (medlemskap, secrets, Zernio-profil per tenant) är identisk för båda typerna.

## Lokala sessioner (dev) och produktion

`POST /api/auth/local-session` ger en oautentiserad `local_*`-session för lokal utveckling. Av
säkerhetsskäl är den **avstängd i produktion** (Vercel/`NODE_ENV=production` när Supabase-auth är
konfigurerad): lokala sessioner kombinerat med ägarskapsbryggan skulle annars låta en anonym besökare
komma åt molnägda OAuth-konton. Sätt `ALLOW_LOCAL_SESSIONS=1` om du uttryckligen vill tillåta dem
på en deployment.

Sessionscookien signeras med `AUTH_SESSION_SECRET` (fallback: `ZERNIO_API_KEY`). Sätt gärna en egen
`AUTH_SESSION_SECRET` i Vercel — saknas båda används numera en slumpad per-instans-nyckel i
produktion (sessioner överlever då inte mellan instanser, men kan aldrig förfalskas).

## Stabila konto-id:n (en koppling = en post)

Alla OAuth-callbacks använder deterministiska konto-id:n baserade på leverantörens identitet
(`gmail_<hash>`, `ig_<hash>`, `tiktok_<hash>`, `x_<hash>`, `yt_<hash>`, `notion_<hash>`,
`outlook_<hash>`, `ocal_<hash>`, `ta_<hash>`, `zernio_<hash av kanal+profil>`): att koppla om samma
konto skriver över den befintliga token-posten istället för att skapa en ny. Varje callback rensar
dessutom äldre dubblett-poster som bevisligen pekar på samma externa konto (samma e-post/provider-id).
Zernio-kanaler är stabila per (kanal, profil) så samma kanal fortfarande kan länkas till flera
profiler.

## Var sparas tokens och profiler?

- **Server / Supabase (rekommenderat i prod):** med `SUPABASE_SERVICE_ROLE_KEY` lagras OAuth-tokens och anslutningsmetadata i tabellen `oauth_token_entries`; kortlivad OAuth-state (CSRF/PKCE) i `oauth_pending_states`; per-profil-secrets (krypterade) i `integration_secrets`. Utan service role: `server/tokens.json` lokalt eller `/tmp` på Vercel.
- **Supabase:** profiler + kontolistor per inloggad användare (`user_id`) när Google-login är aktiverat (`profiles`, `connected_accounts`).
- **Webbläsare:** lokal cache för konton/profiler; inte källa för servertokens.

## OAuth-callback (Instagram via Zernio)

Backend använder denna redirect-URL (byt till din riktiga host/port):  
`{API_BASE_URL}/api/auth/zernio/instagram/callback`  

Efter inloggning skickar servern `zernio_account_id` tillbaka till appen.  
Samma callback finns även under `.../late/instagram/callback` om du redan registrerat den i Zernio/Meta.

## Struktur efter inkrementell refaktor

- `server/providers/*` innehåller provider-specifik integrationslogik (TikTok, YouTube, Shopify, Gmail).
- `server/analytics/*` innehåller rena beräkningar (social/X/shopify metrics).
- `src/hooks/useAccountData.ts` återanvänds för account + fetch + refresh + loading + error i flera pages.
- `src/components/ZernioLinkDialog.tsx` + `src/hooks/useZernioAccounts.ts` isolerar Zernio-länkning från huvudsidebar.

## Lägga till en ny integration (checklista)

En koppling är utspridd över flera filer med flit — plattformsspecifik logik ska
inte läcka. Ordningen nedan är den som `npm run verify` kontrollerar, så följ
den och låt testerna säga till när något saknas.

1. **Plattformstyp** — lägg till värdet i rätt union i `src/types/accounts.ts`
   (`SocialPlatform`, `ReviewsPlatform`, …). Det här steget gör resten till
   kompileringsfel istället för tysta luckor.
2. **Serverrutt** — ny fil `server/routes/oauth/<platform>OAuthRoutes.ts` med en
   `registerXOAuthRoutes`, wire:ad från `server/routes/oauthRoutes.ts`. Inline:a
   aldrig `app.get("/api/auth/...")` i wiring-filen. Provider-anrop (fetch mot
   leverantörens API) hör hemma i `server/providers/`.
3. **Connect-path** — `src/features/connections/connectAuthPath.ts`:
   `NATIVE_CONFIG` är `Record<NativePlatform, …>`, så en ny plattform som saknas
   där är ett typfel. Lägg även till `NATIVE_PATH_OPTIONS` (exakt ett alternativ
   med `isDefault`). MCP-plattformar genereras från `mcpProviders.ts` istället.
4. **Katalog** — `src/lib/connectionCatalog.ts`: område(n), `pageHref`, och
   `serverNeeds` (vilka env-variabler administratören måste sätta). Lägg till
   `catalog.connect.<platform>` i både `src/locales/sv` och `src/locales/en`.
5. **Steg-för-steg-guide** — `src/features/connections/connectGuides.ts`.
   Återanvänd `zernioGuide()` / `googleOAuthGuide()` när flödet är ett standard-
   flöde; annars skriv posten för hand. Guiden ska svara på: vilket konto ska
   användas, var hittar man ett id som måste klistras in, och vad ser man i
   appen när det fungerar. Skickar guiden med en `callbackPath` samlas den in
   automatiskt och testas mot serverns faktiska rutter.
6. **Verifiera** — `npm run verify`. Relevanta skydd:
   - `connectGuides.test.ts` — varje katalogpost har en guide med minst två steg
     och giltiga https-länkar.
   - `connectionRegistration.test.ts` — katalog, connect-path och registrerad
     serverrutt matchar varandra, och varje callback-URL som guiden ber
     användaren whitelista finns verkligen på servern.

Hoppa inte över steg 5. En koppling utan guide får bara en rad ur katalogen,
och då står användaren kvar i leverantörens konsol utan att veta vilket konto
eller vilket id som efterfrågas.
