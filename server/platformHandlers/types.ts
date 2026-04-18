/**
 * Shared contract for per-platform account-data handlers.
 *
 * Handlers are pure(-ish) functions that return a normalized envelope. The
 * router (`accountDataRoute.js`) translates the envelope into HTTP.
 * Keeping handlers HTTP-agnostic makes them testable without spinning up
 * Express.
 */

export type PlatformHandlerResult =
  | { kind: "json"; body: unknown }
  | { kind: "error"; status: number; body: unknown };
