/**
 * GET /api/accounts/:accountId/data — live account data fan-out.
 *
 * Given an Automazing-side `accountId`, looks up the linked platform and
 * returns a unified shape (profile + stats + media/reviews/events) regardless
 * of provider. Zernio-backed channels come through the Zernio gateway;
 * native OAuth channels go through their respective provider modules.
 *
 * Fat per-platform branches (Zernio generic, Instagram-via-Zernio, native
 * Instagram, Google Reviews, Tripadvisor) are split into
 * `server/platformHandlers/<platform>Handler.ts` and return a
 * `PlatformHandlerResult` envelope. Thin delegations to provider modules
 * (TikTok, YouTube, X, Gmail, Outlook, Drive, Shopify, Notion, GBP,
 * Google/Outlook Calendar) stay inline because they are already one-liners.
 */

import { fetchTikTokAccountData } from "../providers/tiktok.ts";
import { fetchYouTubeAccountData } from "../providers/youtube.ts";
import { fetchShopifyAccountData } from "../providers/shopify.ts";
import { fetchNotionAccountData } from "../providers/notion.ts";
import { fetchGoogleCalendarData, fetchOutlookCalendarData } from "../providers/calendar.ts";
import { fetchGmailAccountData } from "../providers/gmail.ts";
import { fetchOutlookMailData } from "../providers/outlookMail.ts";
import { fetchGoogleDriveAccountData } from "../providers/googleDrive.ts";
import { fetchXAccountData } from "../providers/x.ts";
import { fetchGoogleBusinessOfficialAccountData } from "../providers/googleBusinessProfile.ts";

import { handleZernioGenericAccountData } from "../platformHandlers/zernioGenericHandler.ts";
import { handleInstagramZernioAccountData } from "../platformHandlers/instagramZernioHandler.ts";
import { handleInstagramOfficialAccountData } from "../platformHandlers/instagramOfficialHandler.ts";
import { handleGoogleReviewsAccountData } from "../platformHandlers/googleReviewsHandler.ts";
import { handleTripadvisorAccountData } from "../platformHandlers/tripadvisorHandler.ts";

function sendHandlerResult(res, result) {
  if (result.kind === "error") {
    return res.status(result.status).json(result.body);
  }
  return res.json(result.body);
}

function safeAccountDataError(err) {
  const message = err instanceof Error ? err.message : "";
  if (!message) return null;

  if (message.startsWith("Google Drive token invalid")) {
    return { status: 401, error: message };
  }
  if (message.startsWith("Google Drive token refresh")) {
    return { status: 401, error: "Google Drive token invalid. Reconnect the account." };
  }

  return null;
}

export function registerAccountDataRoute(app, deps) {
  const { auth, tokenStore, zernio, getZernioApiKey, debugLog } = deps;

  app.get("/api/accounts/:accountId/data", async (req, res) => {
    const userId = auth.getSessionUserId(req);
    debugLog("pre-fix", "H4", "accountDataRoute:/api/accounts/:accountId/data", "Account data requested", {
      accountId: String(req.params?.accountId || ""),
      hasUserId: Boolean(userId),
      userIdPrefix: userId ? String(userId).slice(0, 14) : null,
    });
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { accountId } = req.params;
    const stored = await tokenStore.get(accountId);
    if (!stored) {
      debugLog("pre-fix", "H4", "accountDataRoute:/api/accounts/:accountId/data", "Stored account missing", {
        accountId,
      });
      return res.status(404).json({ error: "Account not connected" });
    }
    const access = auth.getStoredAccountAccess(stored, userId);
    debugLog("pre-fix", "H4", "accountDataRoute:/api/accounts/:accountId/data", "Owner access check", {
      ownerUserIdPrefix: stored.ownerUserId ? String(stored.ownerUserId).slice(0, 14) : null,
      userIdPrefix: String(userId).slice(0, 14),
      allowed: access.allowed,
      migrate: access.migrate,
      reason: access.reason,
      platform: stored.platform,
    });
    if (!access.allowed) {
      return res.status(404).json({ error: "Account not connected" });
    }
    if (access.migrate) {
      await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }
    const {
      platform,
      accessToken,
      isZernio,
      zernioAccountId,
      zernioPlatform,
    } = stored;
    const instagramViaZernio = stored.instagramViaZernio || stored.isLate;
    const zernioInstagramAccountId = zernioAccountId || stored.lateAccountId;

    try {
      // Zernio-linked channels (same API key; WhatsApp uses templates + business profile per Zernio docs)
      if (isZernio && zernioAccountId && getZernioApiKey()) {
        const result = await handleZernioGenericAccountData({
          zernio,
          stored,
          platform,
          zernioAccountId,
          zernioPlatform,
          getZernioApiKey,
        });
        return sendHandlerResult(res, result);
      }

      if (platform === "instagram" && instagramViaZernio && getZernioApiKey()) {
        const result = await handleInstagramZernioAccountData({
          zernio,
          zernioInstagramAccountId,
          accountId,
        });
        return sendHandlerResult(res, result);
      }

      if (platform === "instagram") {
        const result = await handleInstagramOfficialAccountData({ accessToken });
        return sendHandlerResult(res, result);
      }

      if (platform === "tiktok") {
        const data = await fetchTikTokAccountData(accessToken);
        return res.json(data);
      }

      if (platform === "youtube") {
        const data = await fetchYouTubeAccountData(accessToken);
        return res.json(data);
      }

      if (platform === "x") {
        const data = await fetchXAccountData({
          accessToken,
          stored,
          accountId,
          tokenStore,
          xClientId: process.env.X_CLIENT_ID,
          xClientSecret: process.env.X_CLIENT_SECRET,
        });
        if (data?.error) {
          return res.status(data.status || 500).json({ error: data.error });
        }
        return res.json(data);
      }

      if (platform === "gmail") {
        const data = await fetchGmailAccountData({
          accessToken,
          refreshToken: stored.refreshToken,
          accountId,
          tokenStore,
          stored,
          googleClientId: process.env.GOOGLE_CLIENT_ID,
          googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
        });
        if (data?.error) {
          return res.status(data.status || 500).json({ error: data.error });
        }
        return res.json(data);
      }

      if (platform === "outlook") {
        const data = await fetchOutlookMailData({
          accessToken,
          refreshToken: stored.refreshToken,
          accountId,
          tokenStore,
          stored,
          microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
          microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        });
        if (data?.error) {
          return res.status(data.status || 500).json({ error: data.error });
        }
        return res.json(data);
      }

      if (platform === "google_drive") {
        const data = await fetchGoogleDriveAccountData({
          accessToken,
          refreshToken: stored.refreshToken,
          accountId,
          tokenStore,
          stored,
          googleClientId: process.env.GOOGLE_CLIENT_ID,
          googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
          folderId: typeof req.query?.folderId === "string" ? req.query.folderId : null,
          view: req.query?.view === "shared-with-me" ? "shared-with-me" : "my-drive",
        });
        return res.json(data);
      }

      if (platform === "shopify") {
        const data = await fetchShopifyAccountData(accessToken, stored.shop);
        if (data?.error) {
          return res.status(data.status || 500).json({ error: data.error });
        }
        return res.json(data);
      }

      if (platform === "notion") {
        const data = await fetchNotionAccountData(accessToken);
        if (data?.error) {
          return res.status(data.status || 500).json({ error: data.error, details: data.details });
        }
        return res.json(data);
      }

      if (platform === "google_business") {
        const result = await fetchGoogleBusinessOfficialAccountData({
          appAccountId: accountId,
          stored,
          tokenStore,
          googleClientId: process.env.GOOGLE_CLIENT_ID,
          googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
        });
        if (!result.ok) {
          return res.status(result.status).json({ error: result.error });
        }
        return res.json(result.body);
      }

      if (platform === "google_reviews") {
        const result = await handleGoogleReviewsAccountData({
          zernio,
          stored,
          accountId,
          accessToken,
          isZernio,
          zernioAccountId,
          getZernioApiKey,
          tokenStore,
        });
        return sendHandlerResult(res, result);
      }

      if (platform === "tripadvisor") {
        const result = await handleTripadvisorAccountData({
          zernio,
          stored,
          isZernio,
          zernioAccountId,
          getZernioApiKey,
        });
        return sendHandlerResult(res, result);
      }

      if (platform === "google_calendar") {
        const data = await fetchGoogleCalendarData({
          accessToken,
          refreshToken: stored.refreshToken,
          accountId,
          tokenStore,
          stored,
          googleClientId: process.env.GOOGLE_CLIENT_ID,
          googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
        });
        if (data?.error) {
          return res.status(data.status || 500).json({ error: data.error });
        }
        return res.json(data);
      }

      if (platform === "outlook_calendar") {
        const data = await fetchOutlookCalendarData({
          accessToken,
          refreshToken: stored.refreshToken,
          accountId,
          tokenStore,
          stored,
          microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
          microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        });
        if (data?.error) {
          return res.status(data.status || 500).json({ error: data.error });
        }
        return res.json(data);
      }

      res.status(400).json({ error: "Unknown platform" });
    } catch (err) {
      console.error("Fetch data error:", err);
      const safeError = safeAccountDataError(err);
      if (safeError) {
        return res.status(safeError.status).json({ error: safeError.error });
      }
      res.status(500).json({ error: "Could not fetch data" });
    }
  });
}
