import { afterEach, describe, expect, it } from "vitest";
import {
  clearUserLanguage,
  getGeoLanguage,
  getUserLanguage,
  languageFromCountry,
  needsGeoDetection,
  resolveInitialLanguage,
  setUserLanguage,
} from "@/lib/appLanguage";

const USER_KEY = "app-language";
const GEO_KEY = "app-language-geo";

afterEach(() => {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(GEO_KEY);
});

describe("languageFromCountry", () => {
  it("uses Swedish only for Sweden", () => {
    expect(languageFromCountry("SE")).toBe("sv");
  });

  it("defaults to English for every other country or missing value", () => {
    expect(languageFromCountry("US")).toBe("en");
    expect(languageFromCountry("NO")).toBe("en");
    expect(languageFromCountry(null)).toBe("en");
    expect(languageFromCountry(undefined)).toBe("en");
    expect(languageFromCountry("")).toBe("en");
  });
});

describe("resolveInitialLanguage", () => {
  it("prefers an explicit user choice over geo cache", () => {
    localStorage.setItem(GEO_KEY, "sv");
    setUserLanguage("en");
    expect(resolveInitialLanguage()).toBe("en");
    expect(getUserLanguage()).toBe("en");
  });

  it("falls back to cached geo when there is no user choice", () => {
    localStorage.setItem(GEO_KEY, "sv");
    expect(resolveInitialLanguage()).toBe("sv");
    expect(getGeoLanguage()).toBe("sv");
  });

  it("defaults to English before the first geo lookup", () => {
    expect(resolveInitialLanguage()).toBe("en");
    expect(needsGeoDetection()).toBe(true);
  });

  it("stops needing geo after clearUserLanguage when geo is already cached", () => {
    localStorage.setItem(GEO_KEY, "en");
    setUserLanguage("sv");
    clearUserLanguage();
    expect(getUserLanguage()).toBeNull();
    expect(resolveInitialLanguage()).toBe("en");
    expect(needsGeoDetection()).toBe(false);
  });
});
