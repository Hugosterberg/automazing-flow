/**
 * Instagram (Zernio + direct Meta), Facebook, WhatsApp, Meta Business, Google Ads,
 * and shared Zernio platform/Instagram callbacks.
 * Registered via registerOAuthRoutes → registerMetaSocialOAuthRoutes.
 *
 * Thin aggregator: routes live in instagramOAuthRoutes and metaPlatformOAuthRoutes.
 */

import { registerInstagramOAuthRoutes } from "./instagramOAuthRoutes.ts";
import {
  registerMetaPlatformOAuthRoutes,
  type MetaSocialOAuthRouteCtx,
} from "./metaPlatformOAuthRoutes.ts";
import type { OAuthRoutesDeps } from "./types.ts";

export type { MetaSocialOAuthRouteCtx };

export function registerMetaSocialOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: MetaSocialOAuthRouteCtx
): void {
  registerInstagramOAuthRoutes(app, deps, ctx);
  registerMetaPlatformOAuthRoutes(app, deps, ctx);
}
