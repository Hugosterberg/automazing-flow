/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_APP_URL?: string;
  /** Injected at build time on Vercel from VERCEL_URL (see vite.config.ts). */
  readonly VITE_VERCEL_DEPLOYMENT_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
