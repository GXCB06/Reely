import { describe, expect, it } from "vitest";
import { applyFilters, diverseTop, isExcluded, parseFilters } from "./results";

describe("isExcluded", () => {
  it("matches Thai and English words inside captions", () => {
    expect(isExcluded("สอนเทรดหุ้นมือใหม่ #หุ้น", ["หุ้น"])).toBe(true);
    expect(isExcluded("Best CRYPTO apps", ["crypto"])).toBe(true);
    expect(isExcluded("โปรแกรมบัญชีออนไลน์", ["หุ้น", "crypto"])).toBe(false);
    expect(isExcluded("anything", ["  "])).toBe(false);
  });
});

describe("parseFilters", () => {
  it("accepts known presets only", () => {
    const f = parseFilters({ platform: "tiktok", minViews: "100000", minOutlier: "5", sort: "views", posted: "30" });
    expect(f).toEqual({ platform: "tiktok", minViews: 100000, minOutlier: 5, minSaves: null, postedDays: 30, sort: "views" });
  });
  it("ignores junk", () => {
    const f = parseFilters({ platform: "myspace", minViews: "123", sort: "drop table" });
    expect(f).toEqual({ platform: "all", minViews: null, minOutlier: null, minSaves: null, postedDays: null, sort: "best" });
  });
});

describe("applyFilters", () => {
  const now = new Date("2026-10-25T00:00:00Z").getTime();
  const rows = [
    { id: "a", platform: "tiktok", views: 41320, saves: 755, shares: 90, label: "breakout" as const, publishedAt: "2026-09-29T00:00:00Z", usual: 83, reach: 1.8 },
    { id: "b", platform: "tiktok", views: 6525, saves: 132, shares: 10, label: "strong" as const, publishedAt: "2026-10-09T00:00:00Z", usual: 13, reach: 0.3 },
    { id: "c", platform: "youtube", views: 120000, saves: null, shares: null, label: "strong" as const, publishedAt: "2026-05-01T00:00:00Z", usual: null, reach: 4 },
  ];
  const base = parseFilters({});

  it("sorts best first by default: label, then views weighted by saves + shares", () => {
    expect(applyFilters(rows, base, now).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });
  it("sorts by biggest outlier, using reach when usual is missing", () => {
    expect(applyFilters(rows, { ...base, sort: "outlier" }, now).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("filters by platform, outlier, views and recency", () => {
    expect(applyFilters(rows, { ...base, platform: "youtube" }, now).map((r) => r.id)).toEqual(["c"]);
    expect(applyFilters(rows, { ...base, minOutlier: 10 }, now).map((r) => r.id)).toEqual(["a", "b"]);
    expect(applyFilters(rows, { ...base, minViews: 10000 }, now).map((r) => r.id)).toEqual(["a", "c"]);
    expect(applyFilters(rows, { ...base, postedDays: 30 }, now).map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("sorts by views and recency", () => {
    expect(applyFilters(rows, { ...base, sort: "views" }, now).map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(applyFilters(rows, { ...base, sort: "recent" }, now).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});

describe("diverseTop", () => {
  const row = (id: string, platform: string, views: number) => ({
    id,
    platform,
    views,
    saves: null,
    shares: null,
    label: "breakout" as const,
    publishedAt: null,
    usual: 10,
    reach: null,
  });
  it("keeps the best overall but gives each platform a couple of places", () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => row(`t${i}`, "tiktok", 1_000_000 - i)),
      row("y1", "youtube", 50_000),
      row("y2", "youtube", 40_000),
      row("y3", "youtube", 30_000),
      row("i1", "instagram", 20_000),
    ];
    const top = diverseTop(rows, 10, 2).map((r) => r.id);
    expect(top).toHaveLength(10);
    expect(top.slice(0, 7)).toEqual(["t0", "t1", "t2", "t3", "t4", "t5", "t6"]);
    expect(top).toEqual(expect.arrayContaining(["y1", "y2", "i1"]));
    expect(top).not.toContain("y3");
  });
});
