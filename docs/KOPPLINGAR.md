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

## Var sparas tokens?

- **Server:** `server/tokens.json` (konton som backend känner till).
- **Webbläsare:** `localStorage` för vilka konton som visas per **profil** i appen.

## OAuth-callback (Instagram via Zernio)

Backend använder denna redirect-URL (byt till din riktiga host/port):  
`{API_BASE_URL}/api/auth/zernio/instagram/callback`  

Efter inloggning skickar servern `zernio_account_id` tillbaka till appen.  
Samma callback finns även under `.../late/instagram/callback` om du redan registrerat den i Zernio/Meta.
