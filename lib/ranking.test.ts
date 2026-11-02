import { describe, expect, it } from "vitest";
import { buildFeedback } from "./feedback";
import { bestOrder } from "./ranking";
import { BROADER_SHOWN, topSplit } from "./results";
import type { ScoredVideo } from "./search";

const clip = (id: string, label: ScoredVideo["label"], views: number, relevance: number | null, extra: Partial<ScoredVideo> = {}) =>
  ({
    platformVideoId: id,
    platform: "tiktok",
    creatorHandle: id,
    caption: "",
    label,
    views,
    likes: 0,
    comments: 0,
    saves: 0,
    shares: 0,
    usual: null,
    reach: null,
    publishedAt: null,
    relevance,
    ...extra,
  }) as unknown as ScoredVideo;
const ids = (list: ScoredVideo[]) => list.map((v) => v.platformVideoId);
const sortBy = (list: ScoredVideo[], score: (v: ScoredVideo) => number) => [...list].sort((a, b) => score(b) - score(a));

describe("bestOrder: exact matches first", () => {
  it("puts every exact match above every broader clip, whatever the label", () => {
    const list = [clip("broadBreakout", "breakout", 900_000, 1), clip("exactPlain", "normal", 10_000, 2), clip("exactStrong", "strong", 40_000, 2)];
    expect(ids(sortBy(list, bestOrder(null, null)))).toEqual(["exactStrong", "exactPlain", "broadBreakout"]);
  });

  it("treats a clip with no score as exact, so older researches keep their order", () => {
    const list = [clip("a", "strong", 10_000, null), clip("b", "breakout", 20_000, null), clip("c", "breakout", 5_000, 1)];
    expect(ids(sortBy(list, bestOrder(null, null)))).toEqual(["b", "a", "c"]);
  });

  it("still applies 👍/👎 and account fit inside a group", () => {
    const list = [clip("big", "strong", 50_000, 2, { creatorFit: 0 }), clip("small", "strong", 40_000, 2, { creatorFit: 2 })];
    // Fit 0 → 0.75 of 50K = 37.5K < 40K.
    expect(ids(sortBy(list, bestOrder(null, null)))).toEqual(["small", "big"]);
    const feedback = buildFeedback([{ platform: "tiktok", platformVideoId: "x", creatorHandle: "small", caption: "", vote: -1 }]);
    expect(ids(sortBy(list, bestOrder(null, feedback)))[0]).toBe("big");
  });
});

describe("topSplit", () => {
  it("takes the best 10 from exact matches only and caps the broader section", () => {
    const exact = Array.from({ length: 4 }, (_, i) => clip(`e${i}`, "normal", 1000 * (i + 1), 2));
    const broad = Array.from({ length: 9 }, (_, i) => clip(`b${i}`, "breakout", 100_000 * (i + 1), 1));
    const { top, broader } = topSplit([...exact, ...broad], bestOrder(null, null));
    // Only 4 exact matches: the best list shows 4, never padded with broader clips.
    expect(ids(top).sort()).toEqual(["e0", "e1", "e2", "e3"]);
    expect(broader).toHaveLength(BROADER_SHOWN);
    expect(ids(broader)[0]).toBe("b8");
  });
});
