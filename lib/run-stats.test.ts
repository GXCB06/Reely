import { describe, expect, it } from "vitest";
import { hashtagsOf, risingHashtags, runTotals } from "./run-stats";

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

describe("risingHashtags", () => {
  const now = new Date("2026-10-27T00:00:00Z").getTime();
  const daysAgo = (d: number) => new Date(now - d * 864e5).toISOString();
  it("counts this week against last week and drops generic or one-off tags", () => {
    const rows = [
      { caption: "#ปิดงบ #fyp", publishedAt: daysAgo(1) },
      { caption: "#ปิดงบ #ภาษี", publishedAt: daysAgo(3) },
      { caption: "#ปิดงบ", publishedAt: daysAgo(10) },
      { caption: "#ภาษี", publishedAt: daysAgo(9) },
      { caption: "#old #old2", publishedAt: daysAgo(30) },
      { caption: "#nodate", publishedAt: null },
    ];
    expect(risingHashtags(rows, now)).toEqual([{ tag: "ปิดงบ", thisWeek: 2, lastWeek: 1 }]);
  });
});
