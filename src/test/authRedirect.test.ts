import { describe, expect, it } from "vitest";
import { buildOAuthRedirectUrl } from "@/lib/authRedirect";

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

  it("production ignores explicit localhost and keeps window origin", () => {
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
    ).toBe("https://myapp.vercel.app/messages?x=1");
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
