/**
 * Optional split dev: set `VITE_API_URL` to the API **origin only** (e.g. `http://127.0.0.1:3001`),
 * never include `/api`. Same-origin deploys (Vercel): leave unset.
 */
export function getApiOrigin(): string {
  return (import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
}

/** Build URL for API routes. `path` must start with `/api/`. */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!p.startsWith("/api/")) {
    console.warn("[apiUrl] expected path to start with /api/", p);
  }
  const origin = getApiOrigin();
  if (!origin) return p;
  return `${origin}${p}`;
}
