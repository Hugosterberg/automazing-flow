// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGmailReplyRaw, sendGmailReply } from "../../server/providers/gmail.ts";
import { sendOutlookMailReply } from "../../server/providers/outlookMail.ts";

function decodeBase64Url(raw: string): string {
  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64 + "=".repeat((4 - (base64.length % 4)) % 4), "base64").toString("utf8");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mail replies", () => {
  it("builds a Gmail reply MIME payload with threading headers", () => {
    const raw = buildGmailReplyRaw({
      to: "Customer <customer@example.com>",
      subject: "Question",
      message: "Thanks for reaching out.",
      messageId: "<m1@example.com>",
      references: "<root@example.com>",
    });
    const decoded = decodeBase64Url(raw);
    expect(decoded).toContain("To: Customer <customer@example.com>");
    expect(decoded).toContain("Subject: Re: Question");
    expect(decoded).toContain("In-Reply-To: <m1@example.com>");
    expect(decoded).toContain("References: <root@example.com> <m1@example.com>");
    expect(decoded).toContain("Thanks for reaching out.");
  });

  it("sends Gmail replies through users.messages.send", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "m1",
            threadId: "t1",
            payload: {
              headers: [
                { name: "From", value: "Customer <customer@example.com>" },
                { name: "Subject", value: "Question" },
                { name: "Message-ID", value: "<m1@example.com>" },
              ],
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sent" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendGmailReply({
      accessToken: "token",
      accountId: "gmail-1",
      tokenStore: { set: vi.fn() },
      stored: {},
      messageId: "m1",
      replyText: "Svar",
    });

    expect(result.ok).toBe(true);
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(String(calls[1]?.[0])).toContain("/gmail/v1/users/me/messages/send");
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toMatchObject({ threadId: "t1" });
  });

  it("sends Outlook replies through Graph message reply", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendOutlookMailReply({
      accessToken: "token",
      accountId: "outlook-1",
      tokenStore: { set: vi.fn() },
      stored: {},
      messageId: "m1",
      replyText: "Svar",
    });

    expect(result.ok).toBe(true);
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(String(calls[0]?.[0])).toContain("/me/messages/m1/reply");
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({ comment: "Svar" });
  });
});
