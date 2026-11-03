import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { goalPlan, PLANNER_VERSION } = await import("./tasks");

describe("goalPlan (keyword planner, search quality S4)", () => {
  it("keeps v1 as the live planner, with its pain phrase", () => {
    expect(PLANNER_VERSION).toBe("v1");
    expect(goalPlan("startup").join("\n")).toContain("everyday pain or situation");
    expect(goalPlan("startup").join("\n")).not.toContain("own name");
  });

  it("v2 asks for a feature phrase instead of a pain phrase, and never the product's own name", () => {
    const v2 = goalPlan("startup", "v2").join("\n");
    expect(v2).toContain("main feature");
    expect(v2).not.toContain("everyday pain or situation");
    expect(v2).toContain("Never use the product's own name");
    expect(v2).toContain("Never a phrase about only the pain");
  });

  it("v2 leaves shop and brand recipes as they were, and adds its rules when AI picks the goal", () => {
    expect(goalPlan("shop", "v2").slice(0, 4)).toEqual(goalPlan("shop", "v1").slice(0, 4));
    expect(goalPlan("brand", "v2").join("\n")).toContain("1 tips or how-to phrase in the niche.");
    expect(goalPlan(null, "v2").join("\n")).toContain("Never use the product's own name");
  });
});
