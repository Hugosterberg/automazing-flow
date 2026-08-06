/** Shared OAuth URL and scope constants (extracted from oauthRoutes). */

export const IG_AUTH = "https://api.instagram.com/oauth/authorize";
export const IG_TOKEN = "https://api.instagram.com/oauth/access_token";
export const META_BUSINESS_DEFAULT_SCOPES =
  "public_profile email business_management ads_read ads_management pages_show_list pages_read_engagement pages_manage_engagement";
export const TIKTOK_AUTH = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
export const X_AUTH = "https://x.com/i/oauth2/authorize";
export const X_TOKEN = "https://api.x.com/2/oauth2/token";
export const X_TOKEN_LEGACY = "https://api.twitter.com/2/oauth2/token";
export const X_SCOPES = "tweet.read users.read offline.access like.read";
export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const NOTION_AUTH = "https://api.notion.com/v1/oauth/authorize";
export const NOTION_TOKEN = "https://api.notion.com/v1/oauth/token";
export const CANVA_AUTH = "https://www.canva.com/api/oauth/authorize";
export const YOUTUBE_SCOPES =
  "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile";
export const GMAIL_SCOPES =
  "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";
/**
 * Full Drive scope is required for the Instagram to-post queue: list images,
 * download bytes for Zernio, and move each file into a "posted" folder after
 * a successful publish. Accounts connected under drive.readonly must reconnect.
 */
export const GOOGLE_DRIVE_SCOPES =
  "openid email profile https://www.googleapis.com/auth/drive";
export const GOOGLE_CALENDAR_SCOPES =
  "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_REVIEWS_SCOPES =
  "openid email profile https://www.googleapis.com/auth/business.manage";
export const GOOGLE_ADS_SCOPES =
  "openid email profile https://www.googleapis.com/auth/adwords";
export const OUTLOOK_CALENDAR_SCOPES =
  "offline_access openid profile email User.Read Calendars.ReadWrite";
/**
 * `design:content:write` + `brandtemplate:*:read` unlock the Brand Studio
 * (list templates, read their autofill dataset, create autofilled designs).
 * Accounts connected before these were added carry only `design:content:read`
 * and must reconnect Canva to pick up the wider scope.
 */
export const CANVA_SCOPES =
  "design:content:read design:content:write brandtemplate:content:read brandtemplate:meta:read";
export const FORTNOX_AUTH = "https://apps.fortnox.se/oauth-v1/auth";
export const FORTNOX_TOKEN = "https://apps.fortnox.se/oauth-v1/token";
/** Fortnox scopes are read+write per resource — request only what Economy needs. */
export const FORTNOX_SCOPES = "companyinformation invoice";


