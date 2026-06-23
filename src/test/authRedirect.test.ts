import { describe, expect, it } from "vitest";
import {
  buildAuthReturnPath,
  buildCanonicalAppOriginUrl,
  buildCanonicalAuthCallbackUrl,
  buildOAuthRedirectUrl,
} from "@/lib/authRedirect";

describe("buildOAuthRedirectUrl", () => {
  it("production prefers the current window origin (PKCE verifier lives there)", () => {
    // Redirecting to a configured site URL that differs from where sign-in
    // started loses the PKCE code_verifier and forces a second login.
    expect(
      buildOAuthRedirectUrl({
        prod: true,
        viteSiteUrl: "https://myapp.vercel.app",
        viteAppUrl: "",
        viteVercelDeploymentOrigin: "",
        windowOrigin: "https://myapp-abc123.vercel.app",
        pathname: "/",
        search: "",
      })
    ).toBe("https://myapp-abc123.vercel.app/");
  });

  describe("buildCanonicalAuthCallbackUrl", () => {
    it("moves a Supabase callback from Vercel deployment origin back to the canonical app origin", () => {
      expect(
        buildCanonicalAuthCallbackUrl({
          prod: true,
          siteUrl: "https://automazing.vercel.app",
          appUrl: "",
          vercelDeploymentOrigin: "https://automazing-hugosterbergs-projects.vercel.app",
          windowOrigin: "https://automazing-hugosterbergs-projects.vercel.app",
          pathname: "/",
          search: "?code=d9baafac-a0bc-427d-8d84-86a0bb71780f",
          hasPendingAuthReturn: false,
        })
      ).toBe("https://automazing.vercel.app/?code=d9baafac-a0bc-427d-8d84-86a0bb71780f");
    });

    it("keeps the deployment origin when sign-in started there", () => {
      expect(
        buildCanonicalAuthCallbackUrl({
          prod: true,
          siteUrl: "https://automazing.vercel.app",
          appUrl: "",
          vercelDeploymentOrigin: "https://automazing-hugosterbergs-projects.vercel.app",
          windowOrigin: "https://automazing-hugosterbergs-projects.vercel.app",
          pathname: "/",
          search: "?code=abc",
          hasPendingAuthReturn: true,
        })
      ).toBeNull();
    });

    it("uses Vercel production origin when no explicit site URL is configured", () => {
      expect(
        buildCanonicalAuthCallbackUrl({
          prod: true,
          siteUrl: "",
          appUrl: "",
          vercelProductionOrigin: "https://automazing.vercel.app",
          vercelDeploymentOrigin: "https://automazing-hugosterbergs-projects.vercel.app",
          windowOrigin: "https://automazing-hugosterbergs-projects.vercel.app",
          pathname: "/",
          search: "?code=abc",
          hasPendingAuthReturn: false,
        })
      ).toBe("https://automazing.vercel.app/?code=abc");
    });
  });

  describe("buildCanonicalAppOriginUrl", () => {
    it("moves ordinary app loads from a Vercel deployment host to the production alias", () => {
      expect(
        buildCanonicalAppOriginUrl({
          prod: true,
          siteUrl: "https://automazing.vercel.app",
          appUrl: "",
          vercelProductionOrigin: "https://automazing.vercel.app",
          windowOrigin: "https://automazing-hugosterbergs-projects.vercel.app",
          pathname: "/connections",
          search: "?tab=social",
        })
      ).toBe("https://automazing.vercel.app/connections?tab=social");
    });

    it("does not move active OAuth provider callbacks", () => {
      expect(
        buildCanonicalAppOriginUrl({
          prod: true,
          siteUrl: "https://automazing.vercel.app",
          appUrl: "",
          vercelProductionOrigin: "https://automazing.vercel.app",
          windowOrigin: "https://automazing-hugosterbergs-projects.vercel.app",
          pathname: "/connections",
          search: "?oauth_success=1&platform=instagram",
        })
      ).toBeNull();
    });
  });

  it("production falls back to site URL when window origin is loopback", () => {
    expect(
      buildOAuthRedirectUrl({
        prod: true,
        viteSiteUrl: "https://myapp.vercel.app",
        viteAppUrl: "",
        viteVercelDeploymentOrigin: "",
        windowOrigin: "http://localhost:4173",
        pathname: "/",
        search: "",
      })
    ).toBe("https://myapp.vercel.app/");
  });

  it("production ignores explicit localhost and uses a stable app root", () => {
    expect(
      buildOAuthRedirectUrl({
        prod: true,
        viteSiteUrl: "http://localhost:3000",
        viteAppUrl: "",
        viteVercelDeploymentOrigin: "",
        windowOrigin: "https://myapp.vercel.app",
        pathname: "/messages",
        search: "?x=1",
      })
    ).toBe("https://myapp.vercel.app/");
  });

  it("production uses VITE_VERCEL-style origin when site/app are localhost", () => {
    expect(
      buildOAuthRedirectUrl({
        prod: true,
        viteSiteUrl: "http://localhost:3000",
        viteAppUrl: "http://localhost:8080",
        viteVercelDeploymentOrigin: "https://myapp-abc123.vercel.app",
        windowOrigin: "https://myapp-abc123.vercel.app",
        pathname: "/",
        search: "",
      })
    ).toBe("https://myapp-abc123.vercel.app/");
  });

  it("production with no explicit URL uses window origin", () => {
    expect(
      buildOAuthRedirectUrl({
        prod: true,
        viteSiteUrl: "",
        viteAppUrl: "",
        viteVercelDeploymentOrigin: "",
        windowOrigin: "https://myapp.vercel.app",
        pathname: "/",
        search: "",
      })
    ).toBe("https://myapp.vercel.app/");
  });

  it("dev ignores explicit URL and uses window (local development)", () => {
    expect(
      buildOAuthRedirectUrl({
        prod: false,
        viteSiteUrl: "https://prod.example.com",
        viteAppUrl: "",
        viteVercelDeploymentOrigin: "https://preview.vercel.app",
        windowOrigin: "http://localhost:8080",
        pathname: "/",
        search: "",
      })
    ).toBe("http://localhost:8080/");
  });
});

describe("buildAuthReturnPath", () => {
  it("preserves app path, query and hash for post-login return", () => {
    expect(
      buildAuthReturnPath({
        pathname: "/messages",
        search: "?thread=123&filter=unread",
        hash: "#latest",
      })
    ).toBe("/messages?thread=123&filter=unread#latest");
  });

  it("strips Supabase callback params from the stored return path", () => {
    expect(
      buildAuthReturnPath({
        pathname: "/messages",
        search: "?code=old&state=stale&error=server_error&error_description=nope&keep=1",
      })
    ).toBe("/messages?keep=1");
  });

  it("falls back to root for unsafe non-app paths", () => {
    expect(
      buildAuthReturnPath({
        pathname: "https://evil.example",
        search: "?keep=1",
      })
    ).toBe("/?keep=1");
  });
});
