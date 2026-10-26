import { describe, expect, it } from "vitest";
import { captionLanguage, keywordRegions, looksThai } from "./region";

describe("keywordRegions", () => {
  it("uses one region for th and global", () => {
    expect(keywordRegions("th", 3)).toEqual(["th", "th", "th"]);
    expect(keywordRegions("global", 2)).toEqual(["global", "global"]);
  });
  it("splits both into 3 Thai + 2 worldwide", () => {
    expect(keywordRegions("both", 5)).toEqual(["th", "th", "th", "global", "global"]);
  });
});

describe("looksThai", () => {
  it("detects Thai script", () => {
    expect(looksThai("โปรแกรมบัญชี #accounting")).toBe(true);
    expect(looksThai("Top 5 accounting software")).toBe(false);
  });
});

describe("captionLanguage", () => {
  it("prefers the platform tag, then guesses from the caption", () => {
    expect(captionLanguage({ language: "en", caption: "โปรแกรมบัญชี" })).toBe("en");
    expect(captionLanguage({ caption: "เลิกคีย์บัญชีเองได้แล้ว #บัญชี" })).toBe("th");
    expect(captionLanguage({ caption: "Top 5 accounting tools for small business #xero" })).toBe("en");
    expect(captionLanguage({ caption: "#fyp 😂" })).toBeNull();
  });
});
