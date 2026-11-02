import { describe, expect, it } from "vitest";
import { agreement, briefMetrics, checkHalf, combineJudgements, creatorItem, type EvalClip, effectiveLabels, type Label, latestBatch, pickCheckSample, summarize, summaryMarkdown, topCreators } from "./eval";

const clip = (id: number, platform: EvalClip["platform"], handle: string): EvalClip => ({ id, platform, handle });

describe("effectiveLabels", () => {
  it("lets the owner's correction win over the AI judge", () => {
    const labels = effectiveLabels([
      { item: "1", source: "user", label: 0 },
      { item: "1", source: "ai", label: 2 },
      { item: "2", source: "ai", label: 1 },
    ]);
    expect(labels.get("1")).toBe(0);
    expect(labels.get("2")).toBe(1);
  });
});

describe("topCreators", () => {
  it("lists a platform's creators in the order their first clip appears", () => {
    const clips = [clip(1, "tiktok", "A"), clip(2, "youtube", "x"), clip(3, "tiktok", "b"), clip(4, "tiktok", "a")];
    expect(topCreators(clips, "tiktok")).toEqual(["tiktok:a", "tiktok:b"]);
  });
});

describe("briefMetrics", () => {
  const clips = [
    ...Array.from({ length: 12 }, (_, i) => clip(i + 1, "tiktok", i < 6 ? "big" : `c${i}`)),
    clip(100, "instagram", "ig1"),
    clip(101, "instagram", "ig2"),
  ];
  const labels = new Map<string, Label>([
    ...Array.from({ length: 8 }, (_, i) => [String(i + 1), 2] as [string, Label]),
    ["9", 1],
    ["10", 0],
    ["100", 2],
    [creatorItem("tiktok", "big"), 2],
    [creatorItem("tiktok", "c6"), 0],
  ]);

  it("measures precision on the top 10, loose precision and creators", () => {
    const m = briefMetrics({
      runId: "r",
      region: "th",
      clips,
      labels,
      stats: { platforms: { tiktok: { found: 100, dropped: { offTopic: 25 } } }, credits: { total: 18 } },
      seconds: 42,
    });
    expect(m.platforms.tiktok!.precision10).toEqual({ value: 0.8, judged: 10, of: 10 });
    expect(m.platforms.tiktok!.precision10Loose.value).toBe(0.9);
    expect(m.platforms.tiktok!.creatorPrecision5).toEqual({ value: 0.5, judged: 2, of: 5 });
    expect(m.platforms.tiktok!.noise).toBe(0.25);
    expect(m.platforms.instagram!.useful).toBe(1);
    expect(m.costPerUseful).toBe(2); // 18 credits ÷ 9 clips labelled 2
    // Top 14 clips: 6 from @big plus singles → (6 + 1 + 1) / 14.
    expect(m.diversity).toBeCloseTo(8 / 14);
  });

  it("leaves unjudged clips out instead of counting them as 0 or 2", () => {
    const m = briefMetrics({ runId: "r", region: "th", clips, labels: new Map(), stats: null, seconds: null });
    expect(m.platforms.tiktok!.precision10).toEqual({ value: null, judged: 0, of: 10 });
    expect(m.costPerUseful).toBeNull();
    expect(summarize([m]).precision10.tiktok).toBeNull();
  });
});

describe("summarize", () => {
  it("averages briefs that have a value and prints a Markdown table", () => {
    const a = briefMetrics({ runId: "a", region: "th", clips: [clip(1, "tiktok", "x")], labels: new Map([["1", 2]]), stats: null, seconds: 30 });
    const b = briefMetrics({ runId: "b", region: "global", clips: [clip(2, "tiktok", "y")], labels: new Map([["2", 0]]), stats: null, seconds: 50 });
    const s = summarize([a, b]);
    expect(s.precision10.tiktok).toBe(0.5);
    expect(s.seconds).toBe(40);
    const md = summaryMarkdown([{ name: "All", s }]);
    expect(md).toContain("| All | 2 | 50% |");
  });
});

describe("combineJudgements", () => {
  it("keeps agreement and leans low on disagreement", () => {
    const a = [{ i: 0, label: 2, reason: "a0" }, { i: 1, label: 2, reason: "a1" }, { i: 2, label: 1, reason: "a2" }, { i: 3, label: 1, reason: "a3" }];
    const b = [{ i: 0, label: 2, reason: "b0" }, { i: 1, label: 1, reason: "b1" }, { i: 2, label: 0, reason: "b2" }, { i: 4, label: 2, reason: "b4" }];
    expect(combineJudgements(a, b)).toEqual([
      { i: 0, label: 2, reason: "a0" },
      { i: 1, label: 1, reason: "b1" },
      { i: 2, label: 0, reason: "b2" },
      { i: 3, label: 1, reason: "a3" },
      { i: 4, label: 2, reason: "b4" },
    ]);
  });

  it("uses the one pass that answered", () => {
    expect(combineJudgements(null, [{ i: 0, label: 2, reason: "b" }])).toEqual([{ i: 0, label: 2, reason: "b" }]);
  });
});

describe("latestBatch", () => {
  it("keeps the newest re-runs added within 5 minutes of each other", () => {
    const row = (id: string, at: string, parent: string | null = "p") => ({ id, parent_run_id: parent, added_at: at });
    const rows = [
      row("orig", "2026-11-01T08:00:00Z", null),
      row("old", "2026-11-01T09:00:00Z"),
      row("a", "2026-11-01T10:00:00Z"),
      row("b", "2026-11-01T10:04:00Z"),
      row("c", "2026-11-01T10:07:00Z"),
    ];
    expect(latestBatch(rows).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("agreement", () => {
  const pair = (user: Label, other: Label) => ({ platform: "tiktok" as const, thai: true, user, other });
  it("measures exact agreement, the 2s that P@10 counts, and kappa", () => {
    const a = agreement([pair(2, 2), pair(2, 2), pair(2, 1), pair(1, 2), pair(1, 1), pair(0, 0)]);
    expect(a.n).toBe(6);
    expect(a.exact).toBeCloseTo(4 / 6);
    expect(a.precision2).toBeCloseTo(2 / 3);
    expect(a.recall2).toBeCloseTo(2 / 3);
    // Chance: user 3/6·2, 2/6·1, 1/6·0; other the same → (9 + 4 + 1) / 36.
    expect(a.kappa).toBeCloseTo((4 / 6 - 14 / 36) / (1 - 14 / 36));
  });
  it("has no numbers without pairs", () => {
    expect(agreement([])).toEqual({ n: 0, exact: null, precision2: null, recall2: null, kappa: null });
  });
});

describe("pickCheckSample", () => {
  const item = (runId: string, n: number, platform: "tiktok" | "youtube" | "instagram", ai: Label) => ({ runId, item: String(n), platform, ai });
  it("takes half 2s and half 1/0 per platform, spread over briefs, in a stable order", () => {
    const items = [
      ...Array.from({ length: 30 }, (_, i) => item(i % 3 === 0 ? "a" : i % 3 === 1 ? "b" : "c", i, "tiktok", i < 15 ? 2 : 1)),
      ...Array.from({ length: 4 }, (_, i) => item("a", 100 + i, "youtube", 2)),
      ...Array.from({ length: 12 }, (_, i) => item("b", 200 + i, "youtube", 0)),
    ];
    const s = pickCheckSample(items, 10);
    const tiktok = s.filter((x) => x.platform === "tiktok");
    expect(tiktok.filter((x) => x.ai === 2)).toHaveLength(5);
    expect(new Set(tiktok.map((x) => x.runId)).size).toBe(3);
    // Only 4 YouTube 2s: the rest comes from the 1/0 side.
    const youtube = s.filter((x) => x.platform === "youtube");
    expect(youtube).toHaveLength(10);
    expect(youtube.filter((x) => x.ai === 2)).toHaveLength(4);
    expect(pickCheckSample([...items].reverse(), 10).map((x) => x.item)).toEqual(s.map((x) => x.item));
  });
});

describe("checkHalf", () => {
  it("splits clips into two stable, roughly even halves", () => {
    const halves = Array.from({ length: 200 }, (_, i) => checkHalf("run", String(i)));
    const dev = halves.filter((h) => h === "dev").length;
    expect(dev).toBeGreaterThan(70);
    expect(dev).toBeLessThan(130);
    expect(checkHalf("run", "7")).toBe(checkHalf("run", "7"));
  });
});
