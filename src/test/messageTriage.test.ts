import { describe, expect, it } from "vitest";
import {
  classifyMessageTriage,
  compareByTriage,
  countByTriageBucket,
} from "../features/messages/messageTriage";
import type { UnifiedMessage } from "../features/messages/types";

function msg(partial: Partial<UnifiedMessage> & Pick<UnifiedMessage, "id">): UnifiedMessage {
  return {
    kind: "email",
    channel: "gmail",
    accountId: "a1",
    accountLabel: "Inbox",
    subject: "",
    from: { name: "Ada", email: "ada.lovelace@example.com" },
    date: new Date().toISOString(),
    snippet: "",
    body: "",
    isUnread: true,
    ...partial,
  };
}

describe("classifyMessageTriage", () => {
  it("puts noreply + unsubscribe into noise", () => {
    const result = classifyMessageTriage(
      msg({
        id: "n1",
        from: { name: "Brand", email: "noreply@brand.com" },
        subject: "Weekly digest",
        snippet: "Click here to unsubscribe from our list",
        body: "View in browser · https://x.com · https://y.com · https://z.com",
      })
    );
    expect(result.bucket).toBe("noise");
  });

  it("flags urgent personal asks as today", () => {
    const result = classifyMessageTriage(
      msg({
        id: "t1",
        from: { name: "Erik", email: "erik.svensson@client.se" },
        subject: "Urgent — need contract today",
        snippet: "Can you please send the signed PDF ASAP?",
        isUnread: true,
      })
    );
    expect(result.bucket).toBe("today");
  });

  it("treats DMs as at least week", () => {
    const result = classifyMessageTriage(
      msg({
        id: "d1",
        kind: "dm",
        channel: "instagram",
        subject: "",
        snippet: "Hej! Är ni öppna imorgon?",
        from: { name: "Lisa", email: "" },
      })
    );
    expect(["today", "week"]).toContain(result.bucket);
  });

  it("soft-noreply alone lands in fyi not today", () => {
    const result = classifyMessageTriage(
      msg({
        id: "f1",
        from: { name: "Shopify", email: "noreply@shopify.com" },
        subject: "Your store summary",
        snippet: "Here's what happened this week.",
        isUnread: true,
      })
    );
    expect(result.bucket).not.toBe("today");
    expect(["fyi", "noise"]).toContain(result.bucket);
  });
});

describe("compareByTriage", () => {
  it("orders today before noise", () => {
    const today = msg({
      id: "a",
      subject: "Can you help ASAP?",
      snippet: "Please reply today",
      from: { name: "Bo", email: "bo.lind@corp.se" },
    });
    const noise = msg({
      id: "b",
      from: { name: "News", email: "noreply@news.com" },
      subject: "Newsletter",
      snippet: "Unsubscribe anytime · view in browser",
      body: "https://a.com https://b.com https://c.com",
    });
    expect(compareByTriage(today, noise)).toBeLessThan(0);
  });
});

describe("countByTriageBucket", () => {
  it("sums buckets", () => {
    const counts = countByTriageBucket([
      msg({
        id: "1",
        subject: "Urgent deadline today",
        snippet: "Can you reply ASAP please?",
        from: { name: "A", email: "a.b@x.com" },
      }),
      msg({
        id: "2",
        from: { name: "N", email: "noreply@x.com" },
        subject: "Promo",
        snippet: "Unsubscribe here",
        body: "https://1.com https://2.com https://3.com view in browser",
      }),
    ]);
    expect(counts.today + counts.week + counts.fyi + counts.noise).toBe(2);
    expect(counts.noise).toBeGreaterThanOrEqual(1);
  });
});
