# Gratis API:er för content-automatisering & analys

Den här listan är ett underlag för att bredda content-automatiseringen (idé → skapa → posta)
och analys/förslag-funktionerna på Social media- och Marketing-sidorna. Allt nedan är antingen
**helt nyckellöst** eller har en **gratis nivå** som räcker gott för en enskild verksamhet.

Inget av detta är kopplat i kod ännu (utom där det står "✅ redan klart") — det är research så du
vet exakt vad som behöver skaffas och var det ska sättas när vi bygger vidare.

Mönstret för nycklar följer det befintliga systemet: lägg till en post i
`server/lib/envConfig.ts` → `INTEGRATION_CONFIG_CHECKS` (label + env-namn + förklaring), sätt
värdet i `.env.local` lokalt / Vercel-projektet i produktion, så dyker status (konfigurerad/saknas)
upp automatiskt under **Inställningar → API-nycklar**. Per-tenant-nycklar (om en kund vill använda
sin egen) går via `integration_secrets`-tabellen som `server/lib/secretResolver.ts` redan läser
från, med `process.env` som fallback.

## Redan klart (för referens, inget att göra)

| API | Används till | Status |
|---|---|---|
| Öppna helgdagar/klämdagar, väder (Open-Meteo), valutakurser (Frankfurter) | Planeringssignaler i Daily Brief | ✅ Klart (PR #41), helt nyckellösa |
| Google PageSpeed Insights | Digital Brand-granskningar | ✅ Klart, kräver `PAGESPEED_API_KEY` |
| OpenAI | Content-idéer, captions, AI-rekommendationer, svarsutkast | ✅ Klart, kräver `OPENAI_API_KEY` |
| Cloudinary | Reel-byggaren (30/60s klipp) | ✅ Klart, kräver `CLOUDINARY_*` |

## 1. Content-idéer & trendsignaler (mest värde för "hitta på content")

| API | Vad den ger | Nyckel krävs? | Env-variabel att lägga till | Skaffa nyckel | Gratisgräns | Prioritet |
|---|---|---|---|---|---|---|
| **Wikipedia REST API — "most read"** (`wikimedia.org/api/rest_v1/metrics/pageviews/top`) | Vad som trendar globalt/lokalt just nu — bra grund för "aktuella ämnen"-idéer | Nej, helt nyckellös | – | – | Obegränsad, ingen nyckel | Hög — enklaste vinsten, noll setup |
| **Hacker News API** (Firebase, `hacker-news.firebaseio.com`) | Trendande tech/business-diskussioner, bra för B2B-content | Nej, helt nyckellös | – | – | Obegränsad | Medel (relevant om målgrupp är tech/B2B) |
| **Reddit public JSON** (`reddit.com/r/<sub>/top.json`) | Trendande diskussioner per nisch/subreddit | Nej för läsning (skicka en egen `User-Agent`-header), men riktig Reddit-API (OAuth) ger högre gräns | `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` om ni vill ha OAuth-varianten | reddit.com/prefs/apps (gratis app) | Publika JSON-slutpunkter: några hundra anrop/timme utan nyckel | Medel |
| **GNews.io** | Nyhetsartiklar per sökord/bransch — bra för "reagera på nyheter"-content | Ja | `GNEWS_API_KEY` | gnews.io (gratis registrering) | 100 requests/dag | Medel |
| **NewsData.io** | Alternativ till GNews, bredare språkstöd (bra för svenska) | Ja | `NEWSDATA_API_KEY` | newsdata.io (gratis registrering) | 200 requests/dag | Medel |
| **YouTube Data API v3** | Trendande videor/sökord per kategori/land — idéer för Reels/Shorts | Ja | `YOUTUBE_DATA_API_KEY` | Google Cloud Console (samma projekt som övriga Google-nycklar) | 10 000 enheter/dag (räcker gott) | Medel — extra värdefullt eftersom ni redan har YouTube som plattform |

## 2. Gratis bilder/video för content-skapande (löser "media saknas" i AI-genererade idéer)

Idag skapar content-gap-fillern text/caption-idéer utan bild. Att koppla en gratis bildbank ger
automatiseringen ett verkligt medium att posta, inte bara text.

| API | Vad den ger | Nyckel krävs? | Env-variabel | Skaffa nyckel | Gratisgräns | Prioritet |
|---|---|---|---|---|---|---|
| **Pexels API** | Gratis stockfoton + video, generös gräns, enkel att komma igång med | Ja (men gratis, ingen kortuppgift) | `PEXELS_API_KEY` | pexels.com/api (gratis konto) | 200 req/timme, 20 000/månad | **Hög** — rekommenderad förstahandsval |
| **Pixabay API** | Alternativ/komplement till Pexels, stort bibliotek | Ja | `PIXABAY_API_KEY` | pixabay.com/api/docs | 5 000 req/timme | Medel (bra fallback om Pexels missar en sökning) |
| **Unsplash API** | Stockfoto med hög kvalitet, "Demo"-nyckel funkar direkt | Ja | `UNSPLASH_ACCESS_KEY` | unsplash.com/developers | 50 req/timme (Demo), högre efter godkänd "Production"-ansökan | Låg-medel — bra bildkvalitet men snävare gratisgräns |

## 3. Analys & förslag (bredare underlag till AI-rekommendationerna / Daily Brief)

| API | Vad den ger | Nyckel krävs? | Env-variabel | Skaffa nyckel | Gratisgräns | Prioritet |
|---|---|---|---|---|---|---|
| **Google Search Console API** | Riktiga sök-queries/klick/CTR för er egen domän — underlag för SEO-baserade content-förslag | Nej extra nyckel — återanvänder befintlig Google OAuth (`GOOGLE_CLIENT_ID/SECRET`), kräver bara att scope `webmasters.readonly` läggs till | – (samma klient-ID/secret som redan finns) | Redan skaffad — bara utöka scope | Gratis, generösa kvoter | Hög — noll ny nyckel, bara mer scope |
| **Google Trends (via `google-trends-api`/pytrends-liknande wrapper)** | Sökvolym-trend per nyckelord/region | Nej, ingen officiell nyckel finns (oofficiellt API som scrapas) | – | – | Ostabil/rate-limitad, inte SLA-garanterad | Låg — trevligt att ha, men opålitligt att bygga automation på |
| **exchangerate.host / Frankfurter** | Redan klart för valutakurser (se ovan) | – | – | – | – | — |

## Sammanfattning: vad som behöver skaffas härnäst

Om du vill att jag kopplar in nästa steg av content-automatiseringen, är detta minsta möjliga
nyckeluppsättning för störst effekt, i prioritetsordning:

1. **`PEXELS_API_KEY`** — löser "AI-idéer saknar bild" med minst friktion (gratis konto, ingen granskning).
2. **Utöka befintlig Google OAuth-scope** med `webmasters.readonly` — Search Console-data till AI-rekommendationerna, ingen ny nyckel.
3. **`YOUTUBE_DATA_API_KEY`** — trendande videoformat/sökord som input till content-idéerna, särskilt för Reels/Shorts.
4. Nyckellösa vinster (Wikipedia pageviews, Hacker News) kan kopplas in utan att du behöver göra något alls — bara säga till.

Skaffa nycklarna ovan (gratis registrering per tjänst) och lägg dem i `.env.local` lokalt och i
Vercel-projektets miljövariabler, så tar jag nästa runda och kopplar in dem i
content-idé-generatorn och AI-rekommendationerna.
