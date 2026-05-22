/**
 * Unified Zernio gateway.
 *
 * All server-to-server calls to Zernio should go through this module. Keeping
 * the raw `fetch` calls in one place means:
 *   - auth headers, error shapes, and logging live in exactly one file
 *   - routes/services can be unit-tested by passing a stub `ZernioModule`
 *   - adding rate limiting, retries, or request tracing is a single-file change
 *
 * Individual provider files under `server/providers/*` keep their native OAuth
 * fallbacks for now and are migrated behind this gateway one platform at a
 * time. The gateway is intentionally framework-agnostic: it takes its
 * dependencies via `createZernioModule` rather than importing app-wide
 * singletons.
 */

export type ZernioAuthHeaders = Record<string, string>;

export interface ZernioRawAccount {
  id?: string;
  _id?: string;
  accountId?: string;
  platform?: string;
  type?: string;
  provider?: string;
  channel?: string;
  username?: string;
  handle?: string;
  phoneNumber?: string;
  phone?: string;
  name?: string;
  displayName?: string;
  profileUrl?: string;
  url?: string;
  website?: string;
  [key: string]: unknown;
}

export interface ZernioModuleDeps {
  apiBase: string;
  authHeaders: () => ZernioAuthHeaders | null;
  normalizeAccountsPayload: (body: unknown) => unknown[];
  mapPlatform: (raw: string | undefined) => string | null;
}

/**
 * Uniform response envelope used by every gateway method.
 *
 * `ok` is `true` only when the Zernio API returned a 2xx and the body could be
 * parsed. Callers should branch on `ok` and fall back to their own error
 * handling (log, 502, partial payload, ...) when it's `false`.
 */
export interface ZernioResult<T> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
  details?: unknown;
}

export interface ZernioModule {
  // Generic escape hatch for bespoke endpoints (e.g. enrichment paths). Most
  // code should prefer the typed methods below; use `get` only when wrapping
  // a one-off path isn't worth a dedicated method.
  get<T = Record<string, unknown>>(path: string): Promise<ZernioResult<T>>;

  // Accounts
  listAccounts(): Promise<{
    ok: boolean;
    status: number;
    accounts: ZernioRawAccount[];
    error?: string;
    details?: unknown;
  }>;
  findAccount(zernioAccountId: string): Promise<ZernioRawAccount | null>;
  platformOf(raw: ZernioRawAccount): {
    rawPlatform: string | undefined;
    mappedPlatform: string | null;
  };

  // Profiles
  listProfiles(): Promise<ZernioResult<Record<string, unknown>>>;
  createProfile(payload: { name: string }): Promise<ZernioResult<Record<string, unknown>>>;

  // Analytics / posts
  getAnalytics(accountId: string): Promise<ZernioResult<Record<string, unknown>>>;
  listAccountPosts(
    accountId: string,
    options?: { limit?: number }
  ): Promise<ZernioResult<Record<string, unknown>>>;

  // WhatsApp
  getWhatsappTemplates(accountId: string): Promise<ZernioResult<Record<string, unknown>>>;
  getWhatsappBusinessProfile(
    accountId: string
  ): Promise<ZernioResult<Record<string, unknown>>>;

  // Reviews: tries multiple candidate paths because Zernio returns 404 on some
  // platform/tenant combos. First 2xx wins; returns the body as-is.
  listReviews(
    accountId: string,
    options?: { candidates?: ReviewCandidate[] }
  ): Promise<ZernioResult<Record<string, unknown>>>;

  // Inbox
  listInboxConversations(options?: {
    limit?: number;
    sortOrder?: "asc" | "desc";
    status?: string;
    profileId?: string | null;
    platform?: string;
    cursor?: string;
  }): Promise<ZernioResult<Record<string, unknown>>>;
  listInboxConversationMessages(
    conversationId: string,
    options: {
      accountId: string;
      limit?: number;
      sortOrder?: "asc" | "desc";
      cursor?: string;
    }
  ): Promise<ZernioResult<Record<string, unknown>>>;
}

export type ReviewCandidate =
  | "generic"
  | "account_nested"
  | "google_business"
  | "tripadvisor";

const REVIEW_CANDIDATE_PATHS: Record<ReviewCandidate, (accountId: string) => string> = {
  generic: (id) => `/reviews?accountId=${encodeURIComponent(id)}`,
  account_nested: (id) => `/accounts/${encodeURIComponent(id)}/reviews`,
  google_business: (id) => `/google-business/reviews?accountId=${encodeURIComponent(id)}`,
  tripadvisor: (id) => `/tripadvisor/reviews?accountId=${encodeURIComponent(id)}`,
};

export function createZernioModule(deps: ZernioModuleDeps): ZernioModule {
  /**
   * Internal helper — runs a Zernio HTTP request and wraps the response in the
   * uniform envelope. Does not throw; all network errors become
   * `{ ok: false, status: 500 }`.
   */
  async function request<T = Record<string, unknown>>(
    path: string,
    options: {
      method?: "GET" | "POST";
      body?: unknown;
      extraHeaders?: Record<string, string>;
    } = {}
  ): Promise<ZernioResult<T>> {
    const headers = deps.authHeaders();
    if (!headers) {
      return { ok: false, status: 503, data: {} as T, error: "zernio_api_key_missing" };
    }
    const method = options.method ?? "GET";
    const init: RequestInit = {
      method,
      headers: {
        ...headers,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.extraHeaders ?? {}),
      },
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }
    try {
      const response = await fetch(`${deps.apiBase}${path}`, init);
      const raw: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const bodyObj = (raw || {}) as Record<string, unknown>;
        return {
          ok: false,
          status: response.status,
          data: (raw as T) ?? ({} as T),
          error:
            typeof bodyObj.message === "string"
              ? bodyObj.message
              : typeof bodyObj.error === "string"
              ? bodyObj.error
              : "zernio_request_failed",
          details: raw,
        };
      }
      return { ok: true, status: response.status, data: (raw as T) ?? ({} as T) };
    } catch (e) {
      return {
        ok: false,
        status: 500,
        data: {} as T,
        error: e instanceof Error ? e.message : "zernio_request_failed",
      };
    }
  }

  async function listAccounts() {
    const result = await request<unknown>("/accounts");
    if (!result.ok) {
      return {
        ok: false as const,
        status: result.status,
        accounts: [] as ZernioRawAccount[],
        error: result.error,
        details: result.details,
      };
    }
    const list = deps.normalizeAccountsPayload(result.data) as ZernioRawAccount[];
    return { ok: true as const, status: result.status, accounts: list };
  }

  async function findAccount(zernioAccountId: string): Promise<ZernioRawAccount | null> {
    const { ok, accounts } = await listAccounts();
    if (!ok) return null;
    const needle = String(zernioAccountId).trim();
    return (
      accounts.find(
        (a) =>
          String(a.id || a.accountId || a._id || "") === needle ||
          String(a.accountId || "") === needle
      ) ?? null
    );
  }

  function platformOf(raw: ZernioRawAccount) {
    const rawPlatform = (raw.platform || raw.type || raw.provider || raw.channel) as
      | string
      | undefined;
    const mappedPlatform = deps.mapPlatform(rawPlatform);
    return { rawPlatform, mappedPlatform };
  }

  function listProfiles() {
    return request<Record<string, unknown>>("/profiles");
  }

  function createProfile(payload: { name: string }) {
    return request<Record<string, unknown>>("/profiles", {
      method: "POST",
      body: payload,
    });
  }

  function getAnalytics(accountId: string) {
    return request<Record<string, unknown>>(
      `/analytics?accountId=${encodeURIComponent(accountId)}`
    );
  }

  function listAccountPosts(accountId: string, options?: { limit?: number }) {
    const q = new URLSearchParams();
    if (options?.limit) q.set("limit", String(options.limit));
    const qs = q.toString();
    return request<Record<string, unknown>>(
      `/accounts/${encodeURIComponent(accountId)}/posts${qs ? `?${qs}` : ""}`
    );
  }

  function getWhatsappTemplates(accountId: string) {
    return request<Record<string, unknown>>(
      `/whatsapp/templates?accountId=${encodeURIComponent(accountId)}`
    );
  }

  function getWhatsappBusinessProfile(accountId: string) {
    return request<Record<string, unknown>>(
      `/whatsapp/business-profile?accountId=${encodeURIComponent(accountId)}`
    );
  }

  async function listReviews(
    accountId: string,
    options?: { candidates?: ReviewCandidate[] }
  ): Promise<ZernioResult<Record<string, unknown>>> {
    const headers = deps.authHeaders();
    if (!headers) {
      return { ok: false, status: 503, data: {}, error: "zernio_api_key_missing" };
    }
    const order = options?.candidates ?? ["generic", "account_nested", "google_business"];
    let lastStatus = 404;
    for (const candidate of order) {
      const path = REVIEW_CANDIDATE_PATHS[candidate](accountId);
      const result = await request<Record<string, unknown>>(path);
      if (result.ok) return result;
      lastStatus = result.status;
    }
    return {
      ok: false,
      status: lastStatus,
      data: {},
      error: "zernio_reviews_unavailable",
    };
  }

  function listInboxConversations(options?: {
    limit?: number;
    sortOrder?: "asc" | "desc";
    status?: string;
    profileId?: string | null;
    platform?: string;
    cursor?: string;
  }) {
    const q = new URLSearchParams();
    q.set("limit", String(options?.limit ?? 75));
    q.set("sortOrder", options?.sortOrder ?? "desc");
    q.set("status", options?.status ?? "active");
    if (options?.profileId) q.set("profileId", options.profileId);
    if (options?.platform) q.set("platform", options.platform);
    if (options?.cursor) q.set("cursor", options.cursor);
    return request<Record<string, unknown>>(`/inbox/conversations?${q.toString()}`);
  }

  function listInboxConversationMessages(
    conversationId: string,
    options: {
      accountId: string;
      limit?: number;
      sortOrder?: "asc" | "desc";
      cursor?: string;
    }
  ) {
    const q = new URLSearchParams();
    q.set("accountId", options.accountId);
    q.set("limit", String(options.limit ?? 1));
    q.set("sortOrder", options.sortOrder ?? "desc");
    if (options.cursor) q.set("cursor", options.cursor);
    return request<Record<string, unknown>>(
      `/inbox/conversations/${encodeURIComponent(conversationId)}/messages?${q.toString()}`
    );
  }

  return {
    get: <T = Record<string, unknown>>(path: string) => request<T>(path),
    listAccounts,
    findAccount,
    platformOf,
    listProfiles,
    createProfile,
    getAnalytics,
    listAccountPosts,
    getWhatsappTemplates,
    getWhatsappBusinessProfile,
    listReviews,
    listInboxConversations,
    listInboxConversationMessages,
  };
}
