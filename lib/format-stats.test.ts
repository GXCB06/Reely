import { describe, expect, it } from "vitest";
import { formatStage, postsPerDay, topSounds } from "./format-stats";

const now = new Date("2026-10-26T12:00:00Z").getTime();
const daysAgo = (d: number) => new Date(now - d * 864e5).toISOString();
const post = (d: number, creator: string, views = 1000, sound: { id: string; title: string } | null = null) => ({
  publishedAt: daysAgo(d),
  views,
  creatorHandle: creator,
  sound,
});

describe("postsPerDay", () => {
  it("counts posts per day, oldest first", () => {
    const days = postsPerDay([post(0, "a"), post(0, "b"), post(2, "c"), post(40, "old")], now, 3);
    expect(days.map((d) => d.count)).toEqual([1, 0, 2]);
    expect(days[2].day).toBe("2026-10-26");
  });
});

describe("formatStage", () => {
  it("calls a format fresh when it first appeared in the last 14 days", () => {
    expect(formatStage([post(3, "a"), post(10, "b")], now).stage).toBe("fresh");
  });
  it("detects rising and fading by creators this week vs last week", () => {
    const base = [post(30, "x")];
    const rising = [...base, post(1, "a"), post(2, "b"), post(3, "c"), post(9, "d")];
    const fading = [...base, post(1, "a"), post(8, "b"), post(9, "c"), post(10, "d")];
    expect(formatStage(rising, now)).toMatchObject({ stage: "rising", thisWeek: 3, lastWeek: 1 });
    expect(formatStage(fading, now)).toMatchObject({ stage: "fading", thisWeek: 1, lastWeek: 3 });
  });
});

describe("topSounds", () => {
  it("ranks sounds by how many videos use them, with average views", () => {
    const cat = { id: "1", title: "original sound - greenscreenmemes" };
    const other = { id: "2", title: "Azadi" };
    const sounds = topSounds([post(1, "a", 9_000_000, cat), post(2, "b", 1_000_000, cat), post(3, "c", 50_000, other)]);
    expect(sounds[0]).toEqual({ id: "1", title: cat.title, count: 2, avgViews: 5_000_000 });
    expect(sounds).toHaveLength(2);
  });
});
