import { describe, expect, it } from "vitest";
import { dropPinned } from "./pinned";

describe("dropPinned", () => {
  it("drops older reels pinned above newer ones", () => {
    const reels = [
      { id: "pinned1", publishedAt: "2026-01-29" },
      { id: "pinned2", publishedAt: "2023-12-18" },
      { id: "a", publishedAt: "2026-10-19" },
      { id: "b", publishedAt: "2026-10-17" },
    ];
    expect(dropPinned(reels).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
