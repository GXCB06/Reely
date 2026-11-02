import { describe, expect, it } from "vitest";
import { replayOrder } from "./eval-replay";
import type { ScoredVideo } from "./search";

const clip = (id: string, label: ScoredVideo["label"], views: number, relevance: number | null) =>
  ({
    platformVideoId: id,
    platform: "tiktok",
    creatorHandle: id,
    label,
    views,
    likes: 0,
    comments: 0,
    saves: 0,
    shares: 0,
    relevance,
  }) as unknown as ScoredVideo;

// A broad Breakout, an exact Strong, an exact clip with no label, and two broad Strong clips.
const videos = [
  clip("broadBreakout", "breakout", 500_000, 1),
  clip("exactStrong", "strong", 40_000, 2),
  clip("exactPlain", "normal", 20_000, 2),
  clip("broadStrongBig", "strong", 60_000, 1),
  clip("broadStrongSmall", "strong", 30_000, 1),
];
const ids = (list: ScoredVideo[]) => list.map((v) => v.platformVideoId);

describe("replayOrder", () => {
  it("live is today's order: exact matches first, each group by label tier then views", () => {
    expect(ids(replayOrder("live", videos, null, null))).toEqual(["exactStrong", "exactPlain", "broadBreakout", "broadStrongBig", "broadStrongSmall"]);
  });

  it("beforeS1 is the label-first order", () => {
    expect(ids(replayOrder("beforeS1", videos, null, null))).toEqual(["broadBreakout", "broadStrongBig", "exactStrong", "broadStrongSmall", "exactPlain"]);
  });

  it("exactOnly leaves the clips scored 2; unknown relevance counts as broader here", () => {
    expect(ids(replayOrder("exactOnly", [...videos, clip("unknown", "breakout", 900_000, null)], null, null))).toEqual(["exactStrong", "exactPlain"]);
  });
});
