# automazing-flow

React (Vite) frontend med Express-backend för OAuth och API-proxy mot sociala plattformar, e-handel och e-post (bl.a. Zernio, TikTok, YouTube, Shopify).

## Komma igång

```sh
npm install
npm run dev
```

Frontend: [http://localhost:8080](http://localhost:8080) · API-proxy: `/api` → backend (standardport `3001`).

Kopiera `.env.example` till `.env` och fyll i nycklar du behöver. Kort översikt: **[docs/KOPPLINGAR.md](docs/KOPPLINGAR.md)**.

## Skript

| Kommando           | Beskrivning                          |
| ------------------ | ------------------------------------ |
| `npm run dev`      | Backend + Vite samtidigt             |
| `npm run dev:client` | Endast Vite                        |
| `npm run dev:server` | Endast Express                     |
| `npm run build`    | Produktionsbygge                     |
| `npm run preview`  | Förhandsvisa bygget                  |
| `npm run lint`     | ESLint                               |
| `npm test`         | Vitest                               |

## Teknik

Vite, TypeScript, React, React Router, shadcn/ui, Tailwind CSS, Express.

## Bygga för produktion

```sh
npm run build
```

Servera `dist/` med valfri statisk host och kör Express separat med samma `API_BASE_URL` / `BASE_URL` som i miljön.
