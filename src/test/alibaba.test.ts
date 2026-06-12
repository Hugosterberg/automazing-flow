import { describe, expect, it } from "vitest";
import {
  ALIBABA_IMAGE_HOSTS,
  ALIBABA_PRODUCT_HOSTS,
  normalizeAlibabaImageUrl,
  normalizeAlibabaProductUrl,
  upgradeAlicdnUrl,
} from "../../server/providers/alibaba.ts";

describe("alibaba provider", () => {
  it("accepts alibaba product URLs", () => {
    const url = normalizeAlibabaProductUrl("https://www.alibaba.com/product-detail/Foo_1234567890.html");
    expect(url.hostname).toBe("www.alibaba.com");
  });

  it("accepts 1688 product URLs without protocol", () => {
    const url = normalizeAlibabaProductUrl("detail.1688.com/offer/1234567890.html");
    expect(url.hostname).toBe("detail.1688.com");
    expect(url.protocol).toBe("https:");
  });

  it("rejects unsupported hosts", () => {
    expect(() => normalizeAlibabaProductUrl("https://example.com/product")).toThrow("unsupported_host");
  });

  it("rejects empty URLs", () => {
    expect(() => normalizeAlibabaProductUrl("")).toThrow("missing_url");
  });

  it("allows alicdn image hosts", () => {
    const url = normalizeAlibabaImageUrl("https://sc04.alicdn.com/kf/H123.jpg_350x350.jpg");
    expect(url.hostname.endsWith("alicdn.com")).toBe(true);
  });

  it("rejects image hosts outside allowlist", () => {
    expect(() => normalizeAlibabaImageUrl("https://example.com/image.jpg")).toThrow("unsupported_image_host");
  });

  it("upgrades thumbnail alicdn URLs to larger variants", () => {
    expect(upgradeAlicdnUrl("https://sc04.alicdn.com/kf/H123.jpg_350x350.jpg")).toBe(
      "https://sc04.alicdn.com/kf/H123.jpg"
    );
  });

  it("exports stable host allowlists", () => {
    expect(ALIBABA_PRODUCT_HOSTS).toContain("alibaba.com");
    expect(ALIBABA_IMAGE_HOSTS).toContain("alicdn.com");
  });
});
