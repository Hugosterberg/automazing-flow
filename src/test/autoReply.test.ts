import { describe, expect, it, vi } from "vitest";
import {
  runAutoReplyForProfile,
  automationSettingsRowToDomain,
  DEFAULT_AUTOMATION_SETTINGS,
  type AutomationSettings,
  type AutoReplyDeps,
} from "../../server/automation/autoReply.ts";
import { isInboundZernioMessage } from "../../server/lib/zernioInbox.ts";
import { buildFallbackReplyDraft } from "../../server/ai/replyDraft.ts";
import { describeZernioFailure } from "../../server/providers/zernioModule.ts";

const PROFILE = { id: "bp-1", name: "Los Tios", zernioProfileId: "zp-1" };

const ENABLED_DRAFT: AutomationSettings = {
  ...DEFAULT_AUTOMATION_SETTINGS,
  dmAutoReplyEnabled: true,
  dmAutoReplyMode: "draft",
};

type LogRow = Record<string, unknown>;

/** In-memory stand-in for the two Supabase calls the engine makes. */
function makeFakeSupabase(existingExternalIds: string[] = []) {
  const inserted: LogRow[] = [];
  const known = new Set(existingExternalIds);
  return {
    inserted,
    from(table: string) {
      if (table !== "auto_reply_log") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async in(_col: string, values: string[]) {
                      return {
                        data: values
                          .filter((v) => known.has(v))
                          .map((external_id) => ({ external_id })),
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
        async insert(row: LogRow) {
          const externalId = String(row.external_id);
          if (known.has(externalId)) {
            return { error: { message: "duplicate key", code: "23505" } };
          }
          known.add(externalId);
          inserted.push(row);
          return { error: null };
        },
      };
    },
  };
}

function makeFakeZernio(options: {
  conversations: Array<Record<string, unknown>>;
  latestMessageByConversation?: Record<string, Record<string, unknown>>;
  sendOk?: boolean;
}) {
  const sendInboxMessage = vi.fn(async () =>
    options.sendOk === false
      ? { ok: false as const, status: 402, data: {}, error: "inbox_addon_required" }
      : { ok: true as const, status: 200, data: {} }
  );
  return {
    sendInboxMessage,
    listInboxConversations: vi.fn(async () => ({
      ok: true as const,
      status: 200,
      data: { data: options.conversations },
    })),
    listInboxConversationMessages: vi.fn(async (conversationId: string) => ({
      ok: true as const,
      status: 200,
      data: {
        messages: [
          options.latestMessageByConversation?.[conversationId] ?? {
            id: `m-${conversationId}`,
            text: "Hej! Har ni öppet imorgon?",
            direction: "inbound",
          },
        ],
      },
    })),
  };
}

function makeDeps(
  supabase: ReturnType<typeof makeFakeSupabase>,
  zernio: ReturnType<typeof makeFakeZernio>
): AutoReplyDeps {
  return {
    supabaseAdmin: supabase as never,
    zernio: zernio as never,
    resolveOpenAiKey: async () => null, // fallback drafts — no network in tests
  };
}

describe("runAutoReplyForProfile", () => {
  it("does nothing when auto-reply is disabled", async () => {
    const supabase = makeFakeSupabase();
    const zernio = makeFakeZernio({ conversations: [] });
    const summary = await runAutoReplyForProfile(
      makeDeps(supabase, zernio),
      PROFILE,
      DEFAULT_AUTOMATION_SETTINGS
    );
    expect(summary.note).toBe("dm_auto_reply_disabled");
    expect(zernio.listInboxConversations).not.toHaveBeenCalled();
  });

  it("skips tenants without a Zernio profile", async () => {
    const supabase = makeFakeSupabase();
    const zernio = makeFakeZernio({ conversations: [] });
    const summary = await runAutoReplyForProfile(
      makeDeps(supabase, zernio),
      { ...PROFILE, zernioProfileId: null },
      ENABLED_DRAFT
    );
    expect(summary.note).toBe("no_zernio_profile_for_tenant");
    expect(zernio.listInboxConversations).not.toHaveBeenCalled();
  });

  it("drafts (but does not send) replies for unread conversations in draft mode", async () => {
    const supabase = makeFakeSupabase();
    const zernio = makeFakeZernio({
      conversations: [
        { id: "c1", accountId: "za-1", unreadCount: 2, participantName: "Anna", platform: "instagram" },
        { id: "c2", accountId: "za-1", unreadCount: 0 }, // read — ignored
      ],
    });
    const summary = await runAutoReplyForProfile(makeDeps(supabase, zernio), PROFILE, ENABLED_DRAFT);

    expect(summary.drafted).toBe(1);
    expect(summary.sent).toBe(0);
    expect(zernio.sendInboxMessage).not.toHaveBeenCalled();
    expect(supabase.inserted).toHaveLength(1);
    expect(supabase.inserted[0]).toMatchObject({
      business_profile_id: "bp-1",
      kind: "dm",
      external_id: "c1:m-c1",
      status: "drafted",
      platform: "instagram",
      author_name: "Anna",
    });
    expect(String(supabase.inserted[0].draft_text)).not.toHaveLength(0);
  });

  it("sends via Zernio in send mode and logs status=sent", async () => {
    const supabase = makeFakeSupabase();
    const zernio = makeFakeZernio({
      conversations: [{ id: "c1", accountId: "za-1", unreadCount: 1, participantName: "Anna" }],
    });
    const summary = await runAutoReplyForProfile(makeDeps(supabase, zernio), PROFILE, {
      ...ENABLED_DRAFT,
      dmAutoReplyMode: "send",
    });

    expect(summary.sent).toBe(1);
    expect(zernio.sendInboxMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "c1", accountId: "za-1" })
    );
    expect(supabase.inserted[0]).toMatchObject({ status: "sent" });
  });

  it("logs status=failed when the Zernio send fails", async () => {
    const supabase = makeFakeSupabase();
    const zernio = makeFakeZernio({
      conversations: [{ id: "c1", accountId: "za-1", unreadCount: 1 }],
      sendOk: false,
    });
    const summary = await runAutoReplyForProfile(makeDeps(supabase, zernio), PROFILE, {
      ...ENABLED_DRAFT,
      dmAutoReplyMode: "send",
    });

    expect(summary.failed).toBe(1);
    expect(summary.sent).toBe(0);
    expect(supabase.inserted[0]).toMatchObject({ status: "failed" });
    expect(String(supabase.inserted[0].error)).toContain("inbox_addon_required");
  });

  it("is idempotent: already-logged messages are skipped", async () => {
    const supabase = makeFakeSupabase(["c1:m-c1"]);
    const zernio = makeFakeZernio({
      conversations: [{ id: "c1", accountId: "za-1", unreadCount: 1 }],
    });
    const summary = await runAutoReplyForProfile(makeDeps(supabase, zernio), PROFILE, ENABLED_DRAFT);

    expect(summary.skipped).toBe(1);
    expect(summary.drafted).toBe(0);
    expect(supabase.inserted).toHaveLength(0);
  });

  it("skips conversations whose latest message is from the business itself", async () => {
    const supabase = makeFakeSupabase();
    const zernio = makeFakeZernio({
      conversations: [{ id: "c1", accountId: "za-1", unreadCount: 1 }],
      latestMessageByConversation: {
        c1: { id: "m-out", text: "Tack för ditt meddelande!", direction: "outbound" },
      },
    });
    const summary = await runAutoReplyForProfile(makeDeps(supabase, zernio), PROFILE, ENABLED_DRAFT);

    expect(summary.skipped).toBe(1);
    expect(summary.drafted).toBe(0);
    expect(supabase.inserted).toHaveLength(0);
  });

  it("caps the number of replies per run", async () => {
    const supabase = makeFakeSupabase();
    const conversations = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      accountId: "za-1",
      unreadCount: 1,
    }));
    const zernio = makeFakeZernio({ conversations });
    const summary = await runAutoReplyForProfile(makeDeps(supabase, zernio), PROFILE, ENABLED_DRAFT, {
      maxRepliesPerRun: 2,
    });

    expect(summary.drafted).toBe(2);
    expect(summary.skipped).toBe(3);
    expect(supabase.inserted).toHaveLength(2);
  });
});

describe("automationSettingsRowToDomain", () => {
  it("returns defaults for a missing row", () => {
    expect(automationSettingsRowToDomain(null)).toEqual(DEFAULT_AUTOMATION_SETTINGS);
  });

  it("maps a row and clamps unknown modes to draft", () => {
    const settings = automationSettingsRowToDomain({
      dm_auto_reply_enabled: true,
      dm_auto_reply_mode: "yolo",
      tone: "friendly",
      language: "Swedish",
      instructions: "Never mention prices.",
    });
    expect(settings).toEqual({
      dmAutoReplyEnabled: true,
      dmAutoReplyMode: "draft",
      tone: "friendly",
      language: "Swedish",
      instructions: "Never mention prices.",
    });
  });
});

describe("isInboundZernioMessage", () => {
  it("reads boolean direction flags", () => {
    expect(isInboundZernioMessage({ isFromMe: true })).toBe(false);
    expect(isInboundZernioMessage({ isFromMe: false })).toBe(true);
    expect(isInboundZernioMessage({ isIncoming: true })).toBe(true);
  });

  it("reads string direction and sender type", () => {
    expect(isInboundZernioMessage({ direction: "inbound" })).toBe(true);
    expect(isInboundZernioMessage({ direction: "sent" })).toBe(false);
    expect(isInboundZernioMessage({ senderType: "customer" })).toBe(true);
    expect(isInboundZernioMessage({ senderType: "business" })).toBe(false);
  });

  it("returns null when no signal exists", () => {
    expect(isInboundZernioMessage({ text: "hello" })).toBeNull();
  });
});

describe("describeZernioFailure", () => {
  it("detects the INBOX_REQUIRED code from Zernio", () => {
    const failure = describeZernioFailure({
      status: 403,
      error: "Inbox addon required. Upgrade to access inbox features.",
      data: { error: "Inbox addon required. Upgrade to access inbox features.", code: "INBOX_REQUIRED" },
    });
    expect(failure.code).toBe("zernio_inbox_addon_required");
    expect(failure.message).toContain("Zernio dashboard");
  });

  it("maps a missing API key", () => {
    const failure = describeZernioFailure({ status: 503, error: "zernio_api_key_missing" });
    expect(failure.code).toBe("zernio_api_key_missing");
    expect(failure.message).toContain("ZERNIO_API_KEY");
  });

  it("keeps the upstream message for unauthorized", () => {
    const failure = describeZernioFailure({ status: 401, error: "Invalid token" });
    expect(failure.code).toBe("zernio_unauthorized");
    expect(failure.message).toContain("Invalid token");
  });

  it("flags missing endpoints as plan/account limitations", () => {
    const failure = describeZernioFailure({ status: 404, error: "zernio_request_failed" });
    expect(failure.code).toBe("zernio_not_found");
  });
});

describe("buildFallbackReplyDraft", () => {
  it("addresses the author by name", () => {
    const draft = buildFallbackReplyDraft({ kind: "dm", text: "Hi", authorName: "Anna" });
    expect(draft).toContain("Anna");
  });

  it("thanks high-rating reviewers", () => {
    const draft = buildFallbackReplyDraft({ kind: "review", text: "Great!", rating: 5 });
    expect(draft).toContain("glad you had a good experience");
  });
});
