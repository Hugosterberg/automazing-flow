import { describe, expect, it } from "vitest";
import { connectionFixHint, connectionTestToastMessage } from "@/features/connections/connectionFixHints";
import type { ConnectionCatalogEntry } from "@/lib/connectionCatalog";
import type { Connection } from "@/types/connection";

const catalogEntry: ConnectionCatalogEntry = {
  platform: "gmail",
  label: "Gmail",
  area: "messages",
  pageHref: "/messages",
  pageName: "Messages",
  connectSteps: "Connect Gmail from Messages.",
  serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.",
};

const baseConnection: Connection = {
  id: "c1",
  businessProfileId: "bp1",
  platform: "gmail",
  username: "user",
  displayName: "User",
  health: "healthy",
  connectedAt: "2026-01-01T00:00:00Z",
  lastSyncedAt: null,
  lastSuccessfulSyncAt: null,
  lastSyncError: null,
  isOAuth: true,
  isZernio: false,
};

describe("connectionFixHint", () => {
  it("returns null for healthy connections", () => {
    expect(connectionFixHint(baseConnection, catalogEntry)).toBeNull();
  });

  it("suggests reconnect for expired tokens", () => {
    expect(
      connectionFixHint({ ...baseConnection, health: "expired" }, catalogEntry)
    ).toMatch(/Reconnect/i);
  });

  it("includes server needs for failed sync without provider error", () => {
    expect(
      connectionFixHint({ ...baseConnection, health: "failed" }, catalogEntry)
    ).toContain("GOOGLE_CLIENT_ID");
  });
});

describe("connectionTestToastMessage", () => {
  it("returns success for healthy test", () => {
    const msg = connectionTestToastMessage({ health: "healthy", message: "OK" });
    expect(msg.title).toBe("Connection OK");
    expect(msg.variant).toBeUndefined();
  });

  it("returns destructive variant for unhealthy test", () => {
    const msg = connectionTestToastMessage({
      health: "expired",
      message: "Token expired",
      fix: "Reconnect",
    });
    expect(msg.variant).toBe("destructive");
    expect(msg.description).toContain("Reconnect");
  });
});
