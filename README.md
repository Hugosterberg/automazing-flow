# automazing-flow

En automationshubb för hela din digitala vardag — byggd för att fungera lika bra för en privatperson, ett startup och ett etablerat företag. Koppla dina konton (sociala medier, e-post, kalender, e-handel, annonser, recensioner) och låt appen sköta innehåll, publicering, inkorg, uppföljning och analys från ett ställe.

React (Vite) frontend med Express-backend för OAuth och API-proxy mot tredjepartsplattformar (bl.a. Zernio, TikTok, YouTube, Shopify, Google, Microsoft). Data och auth via Supabase.

## Vad kan man göra?

Appen har två lägen, styrda av den aktiva profilens typ:

- **Private** — din personliga yta: innehåll, sociala medier, kalender, meddelanden, uppgifter, aktivitet och AI-rekommendationer.
- **Business** — allt ovan plus företagsytor: företagsprofil, försäljning/leads, marknadsföring, e-handel, kunder, recensioner och digital närvaro.

| Sida | Vad den gör |
| --- | --- |
| **Company** | Företagsprofil med auto-ifyllnad från org.nr/webbplats (Bolagsverket, Google Places). |
| **Connections** | Koppla konton och plattformar, hälsostatus och felsökning per koppling. |
| **Content** | Bläddra media (Google Drive/Canva), generera bilder, skapa och schemalägg inlägg. |
| **Social Media** | Publicering och statistik för Instagram, TikTok, YouTube, X, Facebook m.fl. |
| **Messages** | Samlad inkorg för DM och e-post med AI-utkast på svar. |
| **Reviews** | Google/Tripadvisor-recensioner med AI-svarsutkast. |
| **Sales** | Leads med AI-förslag, berikning av företagsdata och outreach-utkast. |
| **Marketing** | Kampanjöversikt och ROAS för Google Ads/Meta, rekommendationer och alerts. |
| **E-commerce** | Shopify-synk av produkter, lagerlarm och övergivna varukorgar. |
| **Automations** | Slå på/av schemalagda automationer (auto-svar, digest, pipelines) och se körlogg. |
| **MCP Intelligence** | Research och frågor mot kopplade MCP-källor (SEO, marknad, CRM m.m.). |
| **Tasks / Calendar / Activity** | Uppgifter med AI-assist, kalender, och full aktivitetslogg. |

Produkt- och arkitekturkontext (vision, roadmap, beslut) finns i [ai/](./ai/README.md). Regler för kodändringar finns i [AGENTS.md](./AGENTS.md).

## Komma igång

```sh
npm install
npm run dev
```

Frontend: [http://localhost:8080](http://localhost:8080) · API-proxy: `/api` → backend (standardport `3001`).

Lägg lokala nycklar i `.env.local`. Filen ignoreras av Git och används av backend vid lokal körning. Vilka nycklar som behövs per plattform: **[docs/KOPPLINGAR.md](docs/KOPPLINGAR.md)**. Supabase-auth: **[docs/SUPABASE_AUTH_SETUP.md](docs/SUPABASE_AUTH_SETUP.md)**.

## Skript

| Kommando             | Beskrivning                                   |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Backend + Vite samtidigt                      |
| `npm run dev:client` | Endast Vite                                   |
| `npm run dev:server` | Endast Express                                |
| `npm run build`      | Produktionsbygge                              |
| `npm run preview`    | Förhandsvisa bygget                           |
| `npm run lint`       | ESLint                                        |
| `npm test`           | Vitest                                        |
| `npm run typecheck`  | TypeScript (server + klient)                  |
| `npm run verify`     | Typecheck + lint + test + build (kör före PR) |

## Struktur

```
src/pages/       Sidkomposition (en fil per route)
src/features/    Funktionalitet per domän (UI + hooks + API-klienter)
src/lib/         Delade hjälpare (apiJson, fetchWithTimeout, apiError, …)
server/routes/   Express-routes (tunna; logik i server/lib)
server/lib/      Server-logik och cron-jobb
server/providers/ Provider-specifik integrationskod (en fil per plattform)
supabase/        Migrationer
```

API-anrop från klienten görs med `apiJson` i `src/lib/apiJson.ts` (cookies, timeout och felmeddelanden på ett ställe).

## Teknik

Vite, TypeScript, React, React Router, TanStack Query, shadcn/ui, Tailwind CSS, Express, Supabase.

## Bygga för produktion

```sh
npm run build
```

Servera `dist/` med valfri statisk host och kör Express separat med samma `API_BASE_URL` / `BASE_URL` som i miljön.
