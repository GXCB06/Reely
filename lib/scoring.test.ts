import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatMultiplier,
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
