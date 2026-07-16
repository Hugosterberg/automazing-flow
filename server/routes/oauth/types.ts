import type { ZernioModule } from "../../providers/zernioModule.ts";
import type { SecretResolver } from "../../lib/secretResolver.ts";

export interface OAuthPendingRecord {
  platform: string;
  userId?: string | null;
  profileId?: string | null;
  businessProfileId?: string | null;
  appBaseUrl?: string | null;
  zernioProfileId?: string | null;
  codeVerifier?: string;
  createdAt?: number;
  oauthReturnPage?: string | undefined;
  [key: string]: unknown;
}

export interface OAuthPendingStore {
  get: (state: string | null | undefined) => Promise<OAuthPendingRecord | null>;
  set: (state: string, value: OAuthPendingRecord) => Promise<unknown>;
  delete: (state: string | null | undefined) => Promise<unknown>;
  listZernioRecentForUser: (
    userId: string
  ) => Promise<Array<[string, OAuthPendingRecord]>>;
}

export interface TokenStore {
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
  delete: (id: string) => Promise<unknown>;
}

export interface OAuthRoutesDeps {
  BASE_URL: string;
  API_BASE_URL: string;
  ZERNIO_API_BASE: string;
  zernio: ZernioModule;
  getZernioApiKey: () => string;
  getOrCreateZernioProfileId: (businessProfileId?: string | null) => Promise<string | null>;
  secretResolver: SecretResolver;
  normalizeZernioAccountsPayload: (body: unknown) => unknown[];
  mapZernioPlatform: (raw: string | undefined) => string | null;
  generateState: () => string;
  oauthPendingStore: OAuthPendingStore;
  tokenStore: TokenStore;
  getSessionUserId: (req: unknown) => string | null;
}

export interface ZernioConnectUrlArgs {
  ZERNIO_API_BASE: string;
  zernioKey: string;
  platformSlugs: string[];
  profileId?: string | null;
  redirectUrl: string;
  extraParams?: Record<string, string | null | undefined>;
}

export interface ResolveZernioAccountArgs {
  zernio: ZernioModule;
  mapZernioPlatform: (raw: string | undefined) => string | null;
  desiredPlatform: string;
  queryAccountId?: unknown;
  queryUsername?: unknown;
}

export interface PopupOAuthResult {
  type: string;
  error?: string | null;
  statusCode?: string | null;
  exception?: string | null;
  hint?: string | null;
  [key: string]: unknown;
}

export interface OAuthErrorExtras {
  status?: string | number | null;
  exception?: unknown;
  hint?: unknown;
}


