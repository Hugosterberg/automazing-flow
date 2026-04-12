# Kopplade konton – översikt

Det här projektet pratar med **din backend** (`server/server.js`, port 3001). Frontend proxar `/api` dit i utveckling.

## Zernio (ett API, flera användningar)

**Zernio** ([zernio.com](https://zernio.com)) används till:

| Vad | Hur i appen |
|-----|----------------|
| **Instagram-inloggning** | Sidomeny → Connect more → **Instagram**. Öppnar Zernios OAuth-flöde. |
| **Facebook, WhatsApp, Google Business m.fl.** | Sidomeny → Connect more → välj kanal eller **All Zernio channels…**. Listar konton från Zernio; du väljer vilket som ska länkas. |

**Miljövariabler** (i `.env`):

- `ZERNIO_API_KEY` – krävs för båda ovan.  
- `ZERNIO_PROFILE_ID` – valfritt (workspace/profil i Zernio).  
- `ZERNIO_API_BASE` – valfritt, standard är `https://zernio.com/api/v1`.

Om du fortfarande har `LATE_API_KEY` i en gammal `.env` använder servern den automatiskt tills du byter namn till `ZERNIO_API_KEY`.

Du måste först koppla kanalerna i **Zernio-dashboarden**; appen hämtar sedan listan via API.

## Övriga plattformar

- **TikTok, YouTube, X** – klassisk OAuth mot respektive plattform (egna nycklar i `.env`).
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

## Var sparas tokens och profiler?

- **Server / Supabase (rekommenderat i prod):** med `SUPABASE_SERVICE_ROLE_KEY` lagras OAuth-tokens och anslutningsmetadata i tabellen `oauth_token_entries`; kortlivad OAuth-state (CSRF/PKCE) i `oauth_pending_states`. Utan service role: `server/tokens.json` lokalt eller `/tmp` på Vercel.
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
