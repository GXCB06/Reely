import { describe, expect, it } from "vitest";
import { keywordGroups, keywordKind, keywordRows, type ScoreClip } from "./eval-keywords";

describe("keywordKind", () => {
  it("tells the product's own name and competitors from other keywords", () => {
    expect(keywordKind("GoChek Ultra รีวิว", "GoChek Ultra S24", ["DJI Mic"])).toBe("own");
    expect(keywordKind("AccOS Pro", "AccOS Pro", [])).toBe("own");
    expect(keywordKind("Duolingo app", "AirLearn", ["Duolingo", "Babbel"])).toBe("competitor");
    expect(keywordKind("รีวิวไมโครโฟนไร้สาย", "GoChek Ultra S24", ["DJI Mic"])).toBe("other");
  });
});

describe("keywordRows and keywordGroups", () => {
  const clip = (videoId: string, keyword: string, relevance: number | null, human: 0 | 1 | 2 | null): ScoreClip => ({
    videoId,
    platform: "tiktok",
    keyword,
    relevance,
    human,
  });
  const rows = keywordRows([
    {
      family: "a",
      title: "AirLearn",
      productName: "AirLearn",
      competitors: ["Duolingo"],
      keywords: ["Duolingo app", "language learning app", "AirLearn review"],
      clips: [
        clip("1", "Duolingo app", 2, 2),
        clip("2", "Duolingo app", 2, 1),
        clip("3", "language learning app", 1, 0),
        clip("4", "learn english", 2, 2),
      ],
    },
  ]);

  it("scores each planned keyword, with a row for results found through accounts", () => {
    expect(rows.map((r) => [r.keyword, r.kind, r.results, r.exact, r.labelled, r.onTarget])).toEqual([
      ["Duolingo app", "competitor", 2, 2, 2, 1],
      ["language learning app", "other", 1, 0, 1, 0],
      ["AirLearn review", "own", 0, 0, 0, 0],
      ["", "feeds", 1, 1, 1, 1],
    ]);
  });

  it("adds up per kind", () => {
    const byKind = keywordGroups(rows, (r) => r.kind);
    expect(byKind.find((g) => g.key === "competitor")).toEqual({ key: "competitor", keywords: 1, results: 2, exact: 2, onTarget: 1, labelled: 2 });
    expect(byKind.find((g) => g.key === "own")?.results).toBe(0);
  });
});
