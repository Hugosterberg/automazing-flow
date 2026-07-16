import fs from "fs";

const srcPath = "server/routes/oauthRoutes.ts";
const lines = fs.readFileSync(srcPath, "utf8").split(/\r?\n/);

fs.mkdirSync("server/routes/oauth", { recursive: true });

const typesStart = 32;
const typesEnd = 108;
const constStart = 109;
const constEnd = 139;
const helpersStart = 140;
const helpersEnd = 471;

const typeLines = lines.slice(typesStart, typesEnd);
const constLines = lines.slice(constStart, constEnd);
const helperLines = lines.slice(helpersStart, helpersEnd);

const typesFile = [
  'import type { ZernioModule } from "../../providers/zernioModule.ts";',
  'import type { SecretResolver } from "../../lib/secretResolver.ts";',
  "",
  ...typeLines,
  "",
].join("\n");

const constantsFile = [
  "/** Shared OAuth URL and scope constants (extracted from oauthRoutes). */",
  "",
  ...constLines,
  "",
].join("\n");

const helpersFile = [
  'import crypto from "crypto";',
  'import { describeZernioFailure, type ZernioModule } from "../../providers/zernioModule.ts";',
  'import { fetchZernio, zernioFetchErrorMessage } from "../../lib/zernioFetch.ts";',
  "import type {",
  "  OAuthErrorExtras,",
  "  PopupOAuthResult,",
  "  ResolveZernioAccountArgs,",
  "  ZernioConnectUrlArgs,",
  '} from "./types.ts";',
  "",
  ...helperLines,
  "",
].join("\n");

fs.writeFileSync("server/routes/oauth/types.ts", typesFile);
fs.writeFileSync("server/routes/oauth/constants.ts", constantsFile);
fs.writeFileSync("server/routes/oauth/helpers.ts", helpersFile);

const fileHeader = lines.slice(0, 11).join("\n");
const registerAndRest = lines.slice(472).join("\n");

const newOauth = `${fileHeader}

import crypto from "crypto";
import { describeZernioFailure } from "../providers/zernioModule.ts";
import { fetchZernio, zernioFetchErrorMessage } from "../lib/zernioFetch.ts";
import {
  deterministicAccountId,
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../lib/accountIdentity.ts";
import { exchangeForLongLivedInstagramToken } from "../providers/instagram.ts";
import { getShopifyScopes, getShopifyScopeDiagnostics } from "../lib/shopifyScopes.ts";
import { buildOAuthCallbackErrorQuery } from "../lib/oauthPermissionErrors.ts";
import { exchangeCanvaOAuthCode, fetchCanvaUserIdentity } from "../providers/canva.ts";
import {
  OAUTH_MCP_DIRECTORY,
  isOauthMcpPlatform,
  registerMcpOauthClient,
  exchangeMcpOauthCode,
  connectOauthMcp,
} from "../providers/mcpOauth.ts";
import type { OAuthRoutesDeps } from "./oauth/types.ts";
import {
  CANVA_AUTH,
  CANVA_SCOPES,
  GMAIL_SCOPES,
  GOOGLE_ADS_SCOPES,
  GOOGLE_AUTH,
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_DRIVE_SCOPES,
  GOOGLE_REVIEWS_SCOPES,
  GOOGLE_TOKEN,
  IG_AUTH,
  IG_TOKEN,
  META_BUSINESS_DEFAULT_SCOPES,
  NOTION_AUTH,
  NOTION_TOKEN,
  OUTLOOK_CALENDAR_SCOPES,
  TIKTOK_AUTH,
  TIKTOK_TOKEN,
  X_AUTH,
  X_SCOPES,
  X_TOKEN,
  X_TOKEN_LEGACY,
  YOUTUBE_SCOPES,
} from "./oauth/constants.ts";
import {
  fetchXToken,
  generateCodeChallenge,
  generateCodeVerifier,
  getZernioConnectUrl,
  normalizeRequestedProfileId,
  profileParam,
  resolveAndSelectGoogleBusinessLocation,
  resolveZernioAccountAfterCallback,
  sendPopupOAuthResult,
  zernioConnectFailureHint,
  zernioOauthErrorQuery,
  ZernioConnectError,
  buildContentUrl,
  requestBusinessProfileId,
  parseLocationsFromBody,
  getLocationId,
} from "./oauth/helpers.ts";

export type { OAuthRoutesDeps } from "./oauth/types.ts";

${registerAndRest}
`;

fs.writeFileSync(srcPath, newOauth);
console.log("ok", {
  types: typeLines.length,
  constants: constLines.length,
  helpers: helperLines.length,
  oauthLines: newOauth.split(/\r?\n/).length,
});
