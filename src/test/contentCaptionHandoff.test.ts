import { describe, expect, it, beforeEach } from "vitest";
import {
  CONTENT_CAPTION_HANDOFF_KEY,
  consumeContentCaption,
  stashContentCaption,
} from "@/lib/contentCaptionHandoff";

describe("contentCaptionHandoff", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores and consumes caption once", () => {
    stashContentCaption("Hello world");
    expect(sessionStorage.getItem(CONTENT_CAPTION_HANDOFF_KEY)).toBe("Hello world");
    expect(consumeContentCaption()).toBe("Hello world");
    expect(consumeContentCaption()).toBeNull();
  });
});
