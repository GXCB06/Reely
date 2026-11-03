import { describe, expect, it } from "vitest";
import { compareChannels, dayPart, groupPerformance, lengthBucket, monthlyUsual, multipliers, postingPattern, snapshot, timelinePoints, weeklyGrowth, type ChannelPost } from "./account-analysis";

const NOW = Date.parse("2026-11-03T12:00:00Z");
// Ten posts a day apart, newest first; usual views ~1,000, two hits (3,000 and 5,000).
const posts: ChannelPost[] = [1000, 5000, 900, 1100, 3000, 1000, 950, 1050, 1000, 1200].map((views, i) => ({
  id: `p${i}`,
  views,
  publishedAt: new Date(NOW - i * 864e5).toISOString(),
}));

describe("multipliers and snapshot", () => {
  it("scores each post against the account's usual without it", () => {
    const x = multipliers(posts);
    expect(x.get("p1")).toBeCloseTo(5000 / 1000, 1);
    expect(x.get("p0")).toBeCloseTo(1, 1);
  });

  it("gives usual views, hit rate, posts per week and the trend oldest first", () => {
    const s = snapshot(posts, NOW);
    expect(s.usual).toBe(1025);
    expect(s.hits).toBe(2);
    expect(s.hitRate).toBeCloseTo(0.2);
    expect(s.postsPerWeek).toBe(2.5);
    expect(s.trend[0]).toBe(1200);
    expect(s.trend.at(-1)).toBe(1000);
  });

  it("has no hit rate with too few posts", () => {
    expect(snapshot(posts.slice(0, 3), NOW).hitRate).toBeNull();
  });
});

describe("postingPattern", () => {
  it("is null under 20 posts, and counts hits vs others by Bangkok weekday and time of day", () => {
    expect(postingPattern(posts)).toBeNull();
    // 21 posts at 19:00 Bangkok (12:00 UTC), one hit among them.
    const many: ChannelPost[] = Array.from({ length: 21 }, (_, i) => ({ id: `q${i}`, views: i === 0 ? 9000 : 1000, publishedAt: new Date(NOW - i * 864e5).toISOString() }));
    const p = postingPattern(many)!;
    expect(p.parts.find((x) => x.part === "evening")).toEqual({ part: "evening", hits: 1, others: 20 });
    expect(p.days.reduce((n, d) => n + d.hits + d.others, 0)).toBe(21);
    // 2026-11-03 is a Tuesday (index 1, Monday first).
    expect(p.days[1].hits).toBe(1);
  });

  it("splits the day into five parts", () => {
    expect([5, 6, 12, 15, 20, 23].map(dayPart)).toEqual(["night", "morning", "midday", "afternoon", "evening", "night"]);
  });
});

describe("monthlyUsual", () => {
  it("gives the median views of each of the last months, oldest first", () => {
    const m = monthlyUsual(posts, NOW, 2);
    expect(m.map((x) => x.month)).toEqual(["2026-10", "2026-11"]);
    expect(m[1].posts).toBe(3);
    expect(m[1].usual).toBe(1000);
  });
});

describe("charts", () => {
  it("puts dated posts on a timeline, oldest first, with hits marked", () => {
    const pts = timelinePoints(posts);
    expect(pts[0].id).toBe("p9");
    expect(pts.filter((p) => p.hit).map((p) => p.id).sort()).toEqual(["p1", "p4"]);
  });

  it("buckets lengths", () => {
    expect([null, 8, 15, 45, 60, 61].map(lengthBucket)).toEqual([null, "under15", "s15to30", "s30to60", "s30to60", "over60"]);
  });

  it("groups posts, best first, and flags groups too small to tell", () => {
    const tag: Record<string, string> = { p1: "demo", p4: "demo", p0: "demo", p2: "talk", p3: "talk", p5: "talk", p6: "skit" };
    const rows = groupPerformance(posts, (p) => tag[p.id] ?? null);
    expect(rows.map((r) => [r.key, r.posts, r.enough])).toEqual([
      ["demo", 3, true],
      ["talk", 3, true],
      ["skit", 1, false],
    ]);
    expect(rows[0].hitRate).toBeCloseTo(2 / 3);
  });

  it("compares channels on usual views, hit rate, posting and engagement", () => {
    const [mine] = compareChannels([{ handle: "me", own: true, posts: posts.map((p) => ({ ...p, engagement: 0.05 })) }], NOW);
    expect(mine).toMatchObject({ handle: "me", own: true, usual: 1025, postsPerWeek: 2.5, engagement: 0.05, posts: 10 });
  });

  it("keeps the last snapshot of each week", () => {
    const w = weeklyGrowth([
      { day: "2026-11-03", followers: 3500, usual: 810 },
      { day: "2026-11-05", followers: 3520, usual: 820 },
      { day: "2026-11-10", followers: 3600, usual: 900 },
    ]);
    expect(w).toEqual([
      { week: "2026-11-02", followers: 3520, usual: 820 },
      { week: "2026-11-09", followers: 3600, usual: 900 },
    ]);
  });
});
