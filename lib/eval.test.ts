import { describe, expect, it } from "vitest";
import { briefMetrics, creatorItem, type EvalClip, effectiveLabels, type Label, summarize, summaryMarkdown, topCreators } from "./eval";

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
