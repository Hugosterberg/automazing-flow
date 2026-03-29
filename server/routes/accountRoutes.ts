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

async function fetchZernioAccounts(
  ZERNIO_API_BASE: string,
  zh: Record<string, string> | null,
  normalizeZernioAccountsPayload: (body: unknown) => unknown[]
) {
  const r = await fetch(`${ZERNIO_API_BASE}/accounts`, { headers: zh || {} });
  const body = await r.json().catch(() => ({}));
  const rawList: ZernioAccount[] = r.ok ? (normalizeZernioAccountsPayload(body) as ZernioAccount[]) : [];
  return { r, body, rawList };
}

export function registerAccountRoutes(
  app,
  {
    zernioAuthHeaders,
    ERR_NO_ZERNIO_KEY,
    ZERNIO_API_BASE,
    normalizeZernioAccountsPayload,
    mapZernioPlatform,
    tokenStore,
    getSessionUserId,
  }
) {
  app.get("/api/zernio/accounts", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const zh = zernioAuthHeaders();
    if (!zh) {
      return res.status(503).json({ error: ERR_NO_ZERNIO_KEY });
    }
    try {
      const { r, body, rawList } = await fetchZernioAccounts(
        ZERNIO_API_BASE,
        zh,
        normalizeZernioAccountsPayload
      );
      if (!r.ok) {
        return res.status(r.status).json({
          error: body.message || body.error || "Failed to fetch Zernio accounts",
          details: body,
        });
      }
      const accounts = rawList
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
    const zh = zernioAuthHeaders();
    if (!zh) {
      return res.status(503).json({ error: ERR_NO_ZERNIO_KEY });
    }
    try {
      const { r, body, rawList } = await fetchZernioAccounts(
        ZERNIO_API_BASE,
        zh,
        normalizeZernioAccountsPayload
      );
      if (!r.ok) {
        return res.status(r.status).json({ error: body.message || body.error || "Failed to list Zernio accounts" });
      }
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
      const appAccountId = `zernio_${String(zernioAccountId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
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
      tokenStore.set(appAccountId, {
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

  app.delete("/api/accounts/:accountId", (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { accountId } = req.params;
    const stored = tokenStore.get(accountId);
    if (!stored) {
      return res.status(404).json({ error: "Account not found" });
    }
    if (stored.ownerUserId && stored.ownerUserId !== userId) {
      const isLocalPair =
        String(stored.ownerUserId).startsWith("local_") && String(userId).startsWith("local_");
      if (!isLocalPair) {
        return res.status(404).json({ error: "Account not found" });
      }
      tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }
    if (!stored.ownerUserId) {
      tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }
    if (tokenStore.delete(accountId)) {
      return res.json({ ok: true });
    }
    res.status(404).json({ error: "Account not found" });
  });
}
