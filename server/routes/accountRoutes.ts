import { randomUUID } from "node:crypto";
import type { ZernioModule } from "../providers/zernioModule.ts";
import { accountInBusinessProfile, readRequestBusinessProfileId } from "../lib/profileScope.ts";

const PLATFORM_PROFILE_URL_FALLBACKS: Record<string, (username: string, displayName?: string) => string> = {
  facebook: (username) => `https://facebook.com/${username}`,
  google_business: (username, displayName) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName || username)}`,
  google_reviews: (username, displayName) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName || username)}`,
  tripadvisor: (username) => `https://www.tripadvisor.com/Search?q=${encodeURIComponent(username)}`,
  whatsapp: (username) => `https://wa.me/${String(username).replace(/\D/g, "") || username}`,
  tiktok: (username) => `https://www.tiktok.com/@${username}`,
  instagram: (username) => `https://instagram.com/${username}`,
  x: (username) => `https://twitter.com/${username}`,
  youtube: (username) => `https://youtube.com/@${username}`,
  google_ads: () => "https://ads.google.com",
  meta_business: () => "https://business.facebook.com",
};

type ZernioAccount = Record<string, unknown> & {
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
};

interface AccountRoutesDeps {
  zernio: ZernioModule;
  ERR_NO_ZERNIO_KEY: string;
  mapZernioPlatform: (raw: string | undefined) => string | null;
  tokenStore: {
    get: (id: string) => Promise<Record<string, unknown> | undefined | null>;
    set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
    delete: (id: string) => Promise<boolean>;
    entries: () => Promise<Array<[string, Record<string, unknown>]>>;
  };
  getSessionUserId: (req: unknown) => string | null;
  // Shared ownership/bridge policy from authHelpers — accountRoutes used to
  // carry its own identical copy, which risked the two drifting apart.
  getStoredAccountAccess: (
    stored: Record<string, unknown>,
    userId: string
  ) => { allowed: boolean; migrate: boolean };
}

export function registerAccountRoutes(app, deps: AccountRoutesDeps) {
  const { zernio, ERR_NO_ZERNIO_KEY, mapZernioPlatform, tokenStore, getSessionUserId, getStoredAccountAccess } =
    deps;

  app.get("/api/accounts/connected", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const platformFilter = String(req.query?.platform || "").trim();
    const businessProfileId = readRequestBusinessProfileId(req);
    const results = [];

    const allEntries = await tokenStore.entries();
    for (const [accountId, stored] of allEntries) {
      if (!stored || typeof stored !== "object") continue;
      if (platformFilter && String(stored.platform || "") !== platformFilter) continue;
      if (!accountInBusinessProfile(stored, businessProfileId)) continue;

      const access = getStoredAccountAccess(stored, userId);
      if (!access.allowed) continue;
      if (access.migrate) {
        await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
      }

      results.push({
        account_id: accountId,
        platform: String(stored.platform || ""),
        username: String(stored.username || accountId),
        profile_id: stored.profileId ? String(stored.profileId) : null,
        displayName: stored.displayName ? String(stored.displayName) : null,
        profileUrl: stored.profileUrl ? String(stored.profileUrl) : null,
        zernioAccountId: stored.zernioAccountId ? String(stored.zernioAccountId) : null,
        isZernio: Boolean(stored.isZernio),
        isOAuth: true,
      });
    }

    return res.json({ accounts: results });
  });

  app.get("/api/zernio/accounts", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    try {
      const result = await zernio.listAccounts();
      if (!result.ok) {
        if (result.status === 503) {
          return res.status(503).json({ error: ERR_NO_ZERNIO_KEY });
        }
        return res.status(result.status).json({
          error: result.error || "Failed to fetch Zernio accounts",
          details: result.details,
        });
      }
      const accounts = (result.accounts as ZernioAccount[])
        .map((a) => {
          const rawPlatform = a.platform || a.type || a.provider || a.channel;
          const mappedPlatform = mapZernioPlatform(rawPlatform);
          return { ...a, rawPlatform, mappedPlatform };
        })
        .filter((a) => a.mappedPlatform);
      return res.json({ accounts });
    } catch (e) {
      console.error("[Zernio] /api/zernio/accounts:", e);
      return res.status(500).json({ error: "Zernio accounts request failed" });
    }
  });

  app.post("/api/zernio/link", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const zernioAccountId = String(req.body?.zernioAccountId || "").trim();
    const profileId = String(req.body?.profile_id || req.body?.profileId || "").trim() || null;
    if (!zernioAccountId) {
      return res.status(400).json({ error: "zernioAccountId is required" });
    }
    try {
      const result = await zernio.listAccounts();
      if (!result.ok) {
        if (result.status === 503) {
          return res.status(503).json({ error: ERR_NO_ZERNIO_KEY });
        }
        return res.status(result.status).json({
          error: result.error || "Failed to list Zernio accounts",
        });
      }
      const rawList = result.accounts as ZernioAccount[];
      const acc = rawList.find(
        (a) =>
          String(a.id || a.accountId || a._id) === zernioAccountId ||
          String(a.accountId) === zernioAccountId
      );
      if (!acc) {
        return res.status(404).json({ error: "That account was not found in your Zernio workspace" });
      }
      const rawPlatform = acc.platform || acc.type || acc.provider || acc.channel;
      const platform = mapZernioPlatform(rawPlatform);
      if (!platform) {
        return res.status(400).json({ error: `Unsupported Zernio platform: ${rawPlatform || "unknown"}` });
      }
      // Unique per Automazing connection so the same Zernio channel can be linked to multiple business profiles.
      const appAccountId = randomUUID();
      const username = String(
        acc.username ||
          acc.handle ||
          acc.phoneNumber ||
          acc.phone ||
          acc.name ||
          acc.displayName ||
          zernioAccountId
      ).replace(/^@/, "");
      const displayName = acc.displayName || acc.name || undefined;
      let profileUrl = acc.profileUrl || acc.url || acc.website || undefined;
      if (!profileUrl) {
        const fallbackBuilder = PLATFORM_PROFILE_URL_FALLBACKS[platform];
        profileUrl = fallbackBuilder ? fallbackBuilder(username, displayName) : "https://zernio.com";
      }
      await tokenStore.set(appAccountId, {
        platform,
        accessToken: null,
        ownerUserId: userId,
        profileId,
        isZernio: true,
        zernioAccountId: String(acc.id || acc.accountId || zernioAccountId),
        zernioPlatform: rawPlatform,
        username,
        displayName,
        profileUrl,
      });
      return res.json({
        account_id: appAccountId,
        zernioAccountId: String(acc.id || acc.accountId || zernioAccountId),
        platform,
        username,
        displayName: displayName || username,
        profileUrl,
      });
    } catch (e) {
      console.error("[Zernio] /api/zernio/link:", e);
      return res.status(500).json({ error: "Zernio link failed" });
    }
  });

  app.delete("/api/accounts/:accountId", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { accountId } = req.params;
    const stored = await tokenStore.get(accountId);
    if (!stored) {
      return res.status(404).json({ error: "Account not found" });
    }
    if (stored.ownerUserId && stored.ownerUserId !== userId) {
      const isLocalPair =
        String(stored.ownerUserId).startsWith("local_") && String(userId).startsWith("local_");
      if (!isLocalPair) {
        return res.status(404).json({ error: "Account not found" });
      }
      await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }
    if (!stored.ownerUserId) {
      await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }
    if (await tokenStore.delete(accountId)) {
      return res.json({ ok: true });
    }
    res.status(404).json({ error: "Account not found" });
  });
}
