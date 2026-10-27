import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bestScore,
  engagementFactor,
  engagementRate,
  formatMultiplier,
  keepRate,
  labelFor,
  median,
  passesNoiseFilter,
  reachScore,
  usualScore,
  usualViewsExcluding,
} from "./scoring";

type Feed = { aweme_list: { aweme_id: string; statistics: { play_count: number } }[] };
const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "adapters", "__fixtures__", `${name}.json`), "utf8")) as Feed;

const flowPosts = [
  ...fixture("tiktok-videos-flowaccountchannel-1").aweme_list,
  ...fixture("tiktok-videos-flowaccountchannel-2").aweme_list,
].map((a) => ({ id: a.aweme_id, views: a.statistics.play_count }));

describe("median", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("FlowAccount (real Day 0 data)", () => {
  const top = flowPosts.find((p) => p.id === "7681582419866144001")!;

  it("finds the 41.3K 'why businesses fail' video", () => {
    expect(top.views).toBe(41320);
  });

  it("scores it as a ~80x breakout against usual views", () => {
    const usual = usualViewsExcluding(flowPosts, top.id);
    const x = usualScore(top.views, usual)!;
    expect(x).toBeGreaterThan(70);
    expect(x).toBeLessThan(95);
    expect(labelFor(x, null)).toBe("breakout");
  });

  it("would look minor by followers alone (why usual views matter)", () => {
    const reach = reachScore(top.views, 22800)!;
    expect(reach).toBeLessThan(2);
  });
});

describe("labels and filters", () => {
  it("labels by thresholds and falls back to reach", () => {
    expect(labelFor(5, null)).toBe("breakout");
    expect(labelFor(2.5, null)).toBe("strong");
    expect(labelFor(1.2, null)).toBe("normal");
    expect(labelFor(null, 85)).toBe("breakout");
    expect(labelFor(null, null)).toBe("normal");
  });

  it("hides tiny-channel noise (118 views on 3 subscribers)", () => {
    expect(passesNoiseFilter(118, 3)).toBe(false);
    expect(passesNoiseFilter(41454, 487)).toBe(true);
    expect(passesNoiseFilter(5000, null)).toBe(true);
  });

  it("formats multipliers", () => {
    expect(formatMultiplier(83.04)).toBe("83");
    expect(formatMultiplier(6.53)).toBe("6.5");
    expect(formatMultiplier(0.004)).toBe("<0.1");
  });
});

describe("real viral rules", () => {
  it("needs real views, not just a big multiplier", () => {
    expect(labelFor(36, null, { views: 1800, followers: 400 })).toBe("normal");
    expect(labelFor(36, null, { views: 7000, followers: 400 })).toBe("strong");
    expect(labelFor(36, null, { views: 41_000, followers: 400 })).toBe("breakout");
  });

  it("ignores views ÷ followers on tiny accounts", () => {
    expect(labelFor(null, 3613, { views: 361_000, followers: 100 })).toBe("normal");
    expect(labelFor(null, 27, { views: 192_000, followers: 7200 })).toBe("breakout");
  });

  it("ranks by label, then views weighted by saves + shares", () => {
    expect(keepRate({ views: 10_000, saves: 150, shares: 50 })).toBe(0.02);
    const plain = bestScore({ label: "breakout", views: 100_000, saves: 0, shares: 0 });
    const kept = bestScore({ label: "breakout", views: 80_000, saves: 3000, shares: 1000 });
    const strong = bestScore({ label: "strong", views: 900_000, saves: null, shares: null });
    expect(kept).toBeGreaterThan(plain);
    expect(plain).toBeGreaterThan(strong);
  });

  it("puts a well-engaged clip above a bigger one nobody engages with", () => {
    const big = { platform: "tiktok", label: "breakout" as const, views: 1_000_000, likes: 10_000, comments: 50, saves: 300, shares: 100 };
    const engaged = { platform: "tiktok", label: "breakout" as const, views: 400_000, likes: 40_000, comments: 900, saves: 4_000, shares: 2_500 };
    expect(engagementRate(big)).toBeCloseTo(0.01045, 4);
    expect(engagementFactor(engaged)).toBeGreaterThan(1);
    expect(bestScore(engaged)).toBeGreaterThan(bestScore(big));
  });

  it("judges engagement against the platform and stays neutral without data", () => {
    // 4% likes is typical on YouTube, low on TikTok.
    expect(engagementFactor({ platform: "youtube", views: 100_000, likes: 3_500, comments: 0, saves: null, shares: null })).toBeCloseTo(1, 5);
    expect(engagementFactor({ platform: "tiktok", views: 100_000, likes: 3_500, comments: 0, saves: 0, shares: 0 })).toBeLessThan(0.5);
    expect(engagementFactor({ platform: "instagram", views: 100_000, likes: null, comments: null, saves: null, shares: null })).toBe(1);
  });
});
