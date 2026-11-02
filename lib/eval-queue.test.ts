import { describe, expect, it } from "vitest";
import { pickRepeats, queueOrder, REPEAT_GAP } from "./eval-queue";

describe("queueOrder", () => {
  it("asks each clip once per brief, briefs in order, hold-out last, platforms grouped", () => {
    const q = queueOrder(
      [
        { family: "B", runId: "B", item: "1", platform: "youtube" },
        { family: "A", runId: "A", item: "7", platform: "instagram" },
        { family: "A", runId: "A2", item: "7", platform: "instagram" },
        { family: "A", runId: "A", item: "8", platform: "tiktok" },
        { family: "H", runId: "H", item: "9", platform: "tiktok" },
        { family: "B", runId: "B", item: "2", platform: "tiktok" },
      ],
      [
        { family: "H", holdout: true, order: 0 },
        { family: "A", holdout: false, order: 1 },
        { family: "B", holdout: false, order: 2 },
      ],
    );
    expect(q.map((e) => `${e.family}:${e.item}`)).toEqual(["A:8", "A:7", "B:2", "B:1", "H:9"]);
    // One question for clip 7, saved for both researches of brief A.
    expect(q.find((e) => e.item === "7")?.runIds).toEqual(["A", "A2"]);
  });
});

describe("pickRepeats", () => {
  it("only repeats labels older than the last REPEAT_GAP answers, never twice", () => {
    const labelled = Array.from({ length: REPEAT_GAP + 5 }, (_, i) => ({
      family: "A",
      item: String(i),
      at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
      repeated: i === 0,
    }));
    const picks = pickRepeats(labelled, 10);
    // Items 0-4 are older than the last 30 answers; item 0 was already repeated.
    expect(picks.map((p) => Number(p.item)).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(pickRepeats(labelled.slice(0, REPEAT_GAP), 5)).toEqual([]);
  });
});
