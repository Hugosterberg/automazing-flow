import { describe, expect, it } from "vitest";
import { detectAdChannel, channelBenchmark } from "../../server/lib/marketingBenchmarks";

describe("channelBenchmark", () => {
  it("uses stricter CTR targets for Google Search", () => {
    const search = channelBenchmark("search");
    const social = channelBenchmark("social");
    expect(search.ctrGood).toBeGreaterThan(social.ctrGood);
  });

  it("maps Meta objectives to social channel", () => {
    expect(detectAdChannel("OUTCOME_SALES", "meta_business")).toBe("social");
    expect(detectAdChannel("VIDEO_VIEWS", "meta_business")).toBe("video");
  });
});
