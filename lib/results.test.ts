import { describe, expect, it } from "vitest";
import { applyFilters, isExcluded, parseFilters } from "./results";

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
    expect(f).toEqual({ platform: "all", minViews: null, minOutlier: null, minSaves: null, postedDays: null, sort: "outlier" });
  });
});

describe("applyFilters", () => {
  const now = new Date("2026-10-25T00:00:00Z").getTime();
  const rows = [
    { id: "a", platform: "tiktok", views: 41320, saves: 755, publishedAt: "2026-09-29T00:00:00Z", usual: 83, reach: 1.8 },
    { id: "b", platform: "tiktok", views: 6525, saves: 132, publishedAt: "2026-10-09T00:00:00Z", usual: 13, reach: 0.3 },
    { id: "c", platform: "youtube", views: 120000, saves: null, publishedAt: "2026-05-01T00:00:00Z", usual: null, reach: 4 },
  ];
  const base = parseFilters({});

  it("sorts by biggest outlier by default, using reach when usual is missing", () => {
    expect(applyFilters(rows, base, now).map((r) => r.id)).toEqual(["a", "b", "c"]);
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
