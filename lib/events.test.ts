import { describe, expect, it } from "vitest";
import { eventSchema, sourceOf } from "./events";

describe("eventSchema", () => {
  it("accepts a known event with small props", () => {
    const e = eventSchema.parse({ name: "send_failed", source: "chat", props: { stage: "plan", reason: "timeout" } });
    expect(e.props).toEqual({ stage: "plan", reason: "timeout" });
  });

  it("rejects unknown names, long values and too many props", () => {
    expect(eventSchema.safeParse({ name: "typed_text" }).success).toBe(false);
    expect(eventSchema.safeParse({ name: "save", props: { q: "x".repeat(61) } }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, i]));
    expect(eventSchema.safeParse({ name: "save", props: many }).success).toBe(false);
  });

  it("only takes a uuid as request id", () => {
    expect(eventSchema.safeParse({ name: "run_failed", requestId: "abc" }).success).toBe(false);
    expect(eventSchema.safeParse({ name: "run_failed", requestId: "6f1c1d2e-8a3b-4c5d-9e0f-1a2b3c4d5e6f" }).success).toBe(true);
  });
});

describe("sourceOf", () => {
  it("names the page with or without the locale", () => {
    expect(sourceOf("/th/app/research/123")).toBe("research");
    expect(sourceOf("/app/video/9")).toBe("video");
    expect(sourceOf("/en/app/saved")).toBe("saved");
    expect(sourceOf("/th/app")).toBe("other");
  });
});
