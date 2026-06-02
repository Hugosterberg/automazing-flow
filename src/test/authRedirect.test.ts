import { describe, expect, it } from "vitest";
import { buildAuthReturnPath, buildOAuthRedirectUrl } from "@/lib/authRedirect";

describe("buildOAuthRedirectUrl", () => {
  it("production uses explicit https site URL over window", () => {
    expect(
      buildOAuthRedirectUrl({
        prod: true,
        viteSiteUrl: "https://myapp.vercel.app",
        viteAppUrl: "",
        viteVercelDeploymentOrigin: "",
        windowOrigin: "https://wrong.example.com",
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
