import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { canvasPrompt } = await import("./tasks");

const base = {
  refs: [
    { handle: "flowaccount", platform: "tiktok", views: 41_300, usual: 82, caption: "ปิดงบใน 5 นาที #บัญชี", hook: "ยังคีย์ใบเสร็จเองอยู่?", format: null, angle: null, spoken: null },
  ],
  product: { name: "AccOS Pro", url: null, description: "Online accounting with AI that reads documents", audience: "Thai SMEs", competitors: ["FlowAccount"] },
  goal: "startup" as const,
  note: "Free trial this month",
  page: null,
  instructions: "",
  locale: "th",
};

describe("canvasPrompt (Content Canvas)", () => {
  it("is grounded: the product, the note, each reference by handle, and the no-made-up-numbers rule", () => {
    const p = canvasPrompt({ ...base, format: "demo" });
    expect(p).toContain("Write every field in Thai");
    expect(p).toContain("Product: AccOS Pro");
    expect(p).toContain("Free trial this month");
    expect(p).toContain("@flowaccount (tiktok, 41300 views, 82x their usual)");
    expect(p).toContain("Never invent numbers");
    expect(p).toContain("Beats in order: pain, feature, result, cta.");
  });

  it("asks each format for its own output", () => {
    expect(canvasPrompt({ ...base, format: "hooks" })).toContain("3 different openings");
    expect(canvasPrompt({ ...base, format: "brief" })).toContain("creator or influencer");
    expect(canvasPrompt({ ...base, format: "shopReview" })).toContain("Beats in order: hook, demo, proof, cta.");
  });

  it("rewrites the previous version for a refine, in English when asked", () => {
    const p = canvasPrompt({ ...base, format: "hooks", refine: { kind: "english", previous: { hooks: [{ line: "ฮุก" }] } } });
    expect(p).toContain("Write every field in English");
    expect(p).toContain('"line":"ฮุก"');
    expect(p).toContain("Rewrite it in English.");
  });
});
