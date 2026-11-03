import { describe, expect, it } from "vitest";
import { captionOverlap, madeWithReelySummary, matchCandidates, postResult } from "./did-it-work";

describe("captionOverlap", () => {
  it("scores Thai and English captions by shared letter pairs", () => {
    expect(captionOverlap("คอมเมนต์ เอไอบัญชี แล้วผมส่งให้", "คอมเมนต์ 'เอไอบัญชี' เดี๋ยวผมส่งไปให้เลย #accospro")).toBeGreaterThan(0.4);
    expect(captionOverlap("Close the month in 10 minutes", "Close the month fast")).toBeGreaterThan(0.4);
    expect(captionOverlap("คอมเมนต์ เอไอบัญชี", "Pilates app coming soon")).toBe(0);
    expect(captionOverlap("", "anything")).toBe(0);
  });
});

describe("matchCandidates", () => {
  const version = { text: "คอมเมนต์ เอไอบัญชี แล้วผมส่งเอไอผู้ช่วยนักบัญชีไปให้", createdAt: "2026-11-04T10:00:00Z" };
  const posts = [
    { id: 1, caption: "วิธีใช้ ai กระทบยอดธนาคาร", publishedAt: "2026-11-06T10:00:00Z" },
    { id: 2, caption: "คอมเมนต์ “เอไอบัญชี” แล้วเดี๋ยวผมส่ง เอไอผู้ช่วยนักบัญชีไปให้เลยครับ", publishedAt: "2026-11-08T10:00:00Z" },
    { id: 3, caption: "คอมเมนต์ เอไอบัญชี", publishedAt: "2026-09-01T10:00:00Z" },
    { id: 4, caption: "คอมเมนต์ เอไอบัญชี", publishedAt: "2026-12-30T10:00:00Z" },
  ];

  it("keeps posts from the day before to 30 days after, the most alike first", () => {
    const found = matchCandidates(version, posts);
    expect(found.map((p) => p.id)).toEqual([2, 1]);
    expect(found[0].score).toBeGreaterThan(found[1].score);
  });
});

describe("postResult and madeWithReelySummary", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");

  it("labels a post against the channel's usual and flags it while it is still growing", () => {
    expect(postResult(4200, 810, "2026-11-01T00:00:00Z", now)).toMatchObject({ label: "breakout", days: 9, growing: false });
    expect(postResult(2000, 810, "2026-11-09T00:00:00Z", now)).toMatchObject({ label: "strong", days: 1, growing: true });
    expect(postResult(500, null, null, now)).toMatchObject({ x: null, label: "normal", days: null, growing: false });
  });

  it("says nothing under 3 linked posts, then compares medians", () => {
    expect(madeWithReelySummary([2, 3], [1, 1])).toBeNull();
    expect(madeWithReelySummary([2, 3, 1.5, null], [1, 0.8, 1.2])).toEqual({ count: 3, linked: 2, others: 1 });
  });
});
