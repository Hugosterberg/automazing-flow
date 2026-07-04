import { describe, expect, it } from "vitest";
import {
  countPendingOutreachDrafts,
  runContentPipeline,
  type OutreachQueueItem,
} from "../../server/lib/flowAutomationJobs";
import { parseJobSchedulesJson } from "../../server/lib/profileJobSchedule";

describe("flowAutomationJobs", () => {
  it("counts pending outreach drafts", () => {
    const queue: OutreachQueueItem[] = [
      {
        id: "1",
        leadId: "a",
        leadName: "Acme",
        body: "Hi",
        status: "draft",
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        leadId: "b",
        leadName: "Beta",
        body: "Hello",
        status: "sent",
        createdAt: new Date().toISOString(),
      },
    ];
    expect(countPendingOutreachDrafts(queue)).toBe(1);
  });

  it("includes new flow job keys in default schedules", () => {
    const map = parseJobSchedulesJson({});
    expect(map["sales-outreach-auto"].enabled).toBe(false);
    expect(map["content-pipeline"].enabled).toBe(false);
    expect(map["cart-recovery"].enabled).toBe(false);
    expect(map["review-reply-auto"].enabled).toBe(false);
    expect(map["publish-scheduled-posts"].enabled).toBe(true);
  });

  it("counts pending review reply drafts", async () => {
    const { countPendingReviewReplyDrafts } = await import("../../server/lib/flowAutomationJobs");
    expect(
      countPendingReviewReplyDrafts([
        { id: "1", reviewId: "r1", accountId: "a", author: "Ann", reviewText: "Great", draft: "Thanks!", status: "draft", createdAt: "" },
        { id: "2", reviewId: "r2", accountId: "a", author: "Bob", reviewText: "Ok", draft: "Thanks", status: "sent", createdAt: "" },
      ])
    ).toBe(1);
  });

  it("skips content pipeline when no workflows enabled and queue empty", async () => {
    const supabaseAdmin = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle() {
                        return Promise.resolve({ data: null, error: null });
                      },
                    };
                  },
                };
              },
            };
          },
          upsert() {
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    const result = await runContentPipeline({
      supabaseAdmin,
      businessProfileId: "bp-1",
      schedules: parseJobSchedulesJson({}),
    });
    expect(result.scheduled).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
