import { describe, expect, it } from "vitest";
import { hashtagsOf, runTotals } from "./run-stats";

const v = (caption: string, views: number | null, creatorHandle = "a", platform = "tiktok") => ({ caption, views, creatorHandle, platform });

describe("hashtagsOf", () => {
  it("reads Thai and English tags once each, lower-cased", () => {
    expect(hashtagsOf("ทำบัญชีง่าย #บัญชี #SME #sme #ภาษีเงินได้ ok")).toEqual(["บัญชี", "sme", "ภาษีเงินได้"]);
  });
  it("handles empty captions", () => {
    expect(hashtagsOf("")).toEqual([]);
    expect(hashtagsOf(null)).toEqual([]);
  });
});

describe("runTotals", () => {
  it("sums views, averages over known views and counts distinct creators per platform", () => {
    const t = runTotals([v("#a", 100, "x"), v("#a #b", 300, "X"), v("", null, "x", "youtube")]);
    expect(t).toMatchObject({ videos: 3, views: 400, avgViews: 200, creators: 2, hashtags: 2 });
  });
  it("lists repeated topic tags and leaves out generic ones", () => {
    const t = runTotals([v("#fyp #บัญชี #viral", 1), v("#fyp #บัญชี", 1), v("#once", 1), v("#foryoupage #fyp", 1)]);
    expect(t.topHashtags).toEqual([{ tag: "บัญชี", count: 2 }]);
    expect(t.hashtags).toBe(5);
  });
});
