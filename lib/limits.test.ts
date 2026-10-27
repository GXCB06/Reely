import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { isOwner, thaiDayStart } = await import("./limits");

describe("thaiDayStart", () => {
  it("is midnight in Thailand", () => {
    // 2026-10-27 01:30 in Thailand = 10-26 18:30 UTC → the Thai day started 10-26 17:00 UTC.
    expect(thaiDayStart(Date.UTC(2026, 9, 26, 18, 30))).toBe("2026-10-26T17:00:00.000Z");
    // 2026-10-27 06:59 in Thailand.
    expect(thaiDayStart(Date.UTC(2026, 9, 26, 23, 59))).toBe("2026-10-26T17:00:00.000Z");
    // 2026-10-27 07:00 in Thailand is still the same Thai day.
    expect(thaiDayStart(Date.UTC(2026, 9, 27, 0, 0))).toBe("2026-10-26T17:00:00.000Z");
    expect(thaiDayStart(Date.UTC(2026, 9, 27, 17, 0))).toBe("2026-10-27T17:00:00.000Z");
  });
});

describe("isOwner", () => {
  it("reads REELY_OWNER_EMAILS, ignoring case and spaces", () => {
    vi.stubEnv("REELY_OWNER_EMAILS", "Owner@Example.com, second@example.com");
    expect(isOwner("owner@example.com")).toBe(true);
    expect(isOwner("second@example.com")).toBe(true);
    expect(isOwner("friend@example.com")).toBe(false);
    expect(isOwner(null)).toBe(false);
    vi.unstubAllEnvs();
  });
});
