import { describe, expect, it } from "vitest";
import { aggregateStatus, statusFromConnection } from "./connectionStatus";
import type { Connection, ConnectionHealth } from "@/types/connection";

function conn(health: ConnectionHealth): Connection {
  return {
    id: `c-${health}`,
    businessProfileId: "bp-1",
    platform: "instagram",
    username: "user",
    connectedAt: "2026-01-01T00:00:00Z",
    disconnectedAt: null,
    isOAuth: true,
    isZernio: false,
    health,
  } as Connection;
}

describe("statusFromConnection", () => {
  it("maps every health to an actionable status", () => {
    expect(statusFromConnection(conn("healthy"))).toBe("connected");
    expect(statusFromConnection(conn("pending"))).toBe("syncing");
    expect(statusFromConnection(conn("failed"))).toBe("error");
    expect(statusFromConnection(conn("expired"))).toBe("reconnect_required");
    expect(statusFromConnection(conn("disconnected"))).toBe("not_connected");
    // "missing" means the row exists but credentials are gone — the user
    // action is a re-auth, so it must NOT read as connected/not connected.
    expect(statusFromConnection(conn("missing"))).toBe("reconnect_required");
  });
});

describe("aggregateStatus", () => {
  it("returns not_connected for no rows", () => {
    expect(aggregateStatus([])).toBe("not_connected");
  });

  it("healthy rows aggregate to connected", () => {
    expect(aggregateStatus([conn("healthy"), conn("healthy")])).toBe("connected");
  });

  it("the most severe row wins", () => {
    expect(aggregateStatus([conn("healthy"), conn("expired")])).toBe("reconnect_required");
    expect(aggregateStatus([conn("expired"), conn("failed")])).toBe("error");
    expect(aggregateStatus([conn("healthy"), conn("pending")])).toBe("syncing");
  });

  it("missing surfaces as reconnect_required, not connected", () => {
    // Regression: this used to fall through to "connected", so the card said
    // Connected while the daily brief flagged the same row as critical.
    expect(aggregateStatus([conn("missing")])).toBe("reconnect_required");
    expect(aggregateStatus([conn("healthy"), conn("missing")])).toBe("reconnect_required");
  });
});
