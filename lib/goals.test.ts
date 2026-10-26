import { describe, expect, it } from "vitest";
import { goalScore, isGoal } from "./goals";

const v = (over: Partial<Parameters<typeof goalScore>[0]> = {}) => ({
  label: "breakout" as const,
  views: 100_000,
  saves: 100,
  shares: 100,
  hasShop: false,
  creatorFollowers: 500_000,
  caption: "great video",
  usual: 5,
  reach: null,
  ...over,
});

describe("goalScore", () => {
  it("keeps the label first whatever the goal", () => {
    const strongShop = v({ label: "strong", hasShop: true, views: 900_000 });
    expect(goalScore(v(), "sell")).toBeGreaterThan(goalScore(strongShop, "sell"));
  });
  it("sell: a Shop video beats a bigger one without a Shop link", () => {
    expect(goalScore(v({ hasShop: true }), "sell")).toBeGreaterThan(goalScore(v({ views: 150_000 }), "sell"));
  });
  it("shop: a Thai clip from a small account beats a bigger English one", () => {
    const thai = v({ caption: "เปิดร้านกาแฟวันแรก ลูกค้าเต็มร้าน", creatorFollowers: 8_000 });
    const english = v({ caption: "Opening day at our coffee shop was packed", views: 150_000 });
    expect(goalScore(thai, "shop")).toBeGreaterThan(goalScore(english, "shop"));
  });
  it("startup: saves count more than raw views", () => {
    expect(goalScore(v({ saves: 6_000 }), "startup")).toBeGreaterThan(goalScore(v({ views: 160_000 }), "startup"));
  });
  it("brand: a bigger jump over usual views wins", () => {
    expect(goalScore(v({ usual: 80 }), "brand")).toBeGreaterThan(goalScore(v({ usual: 5, views: 140_000 }), "brand"));
  });
  it("no goal = the plain best score", () => {
    expect(goalScore(v({ views: 150_000 }), null)).toBeGreaterThan(goalScore(v({ hasShop: true }), null));
  });
});

describe("copyable", () => {
  it("ranks a clip a small business can film above a bigger one it can't", () => {
    expect(goalScore(v({ copyable: 2 }), "startup")).toBeGreaterThan(goalScore(v({ copyable: 0, views: 150_000 }), "startup"));
    expect(goalScore(v({ copyable: 2 }), null)).toBeGreaterThan(goalScore(v({ copyable: 0, views: 150_000 }), null));
  });
  it("leaves unknown ratings neutral", () => {
    expect(goalScore(v({ copyable: null }), null)).toBe(goalScore(v(), null));
  });
});

describe("isGoal", () => {
  it("accepts only the 4 goals", () => {
    expect(isGoal("sell")).toBe(true);
    expect(isGoal("other")).toBe(false);
    expect(isGoal(null)).toBe(false);
  });
});
