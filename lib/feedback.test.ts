import { describe, expect, it } from "vitest";
import { buildFeedback, feedbackFactor, withFeedback } from "./feedback";

const clip = (id: string, creatorHandle: string, vote: 1 | -1 = 1) => ({
  platform: "tiktok",
  platformVideoId: id,
  creatorHandle,
  vote,
  caption: `clip ${id}`,
});

describe("buildFeedback", () => {
  it("is null without votes", () => {
    expect(buildFeedback([])).toBeNull();
  });
  it("splits votes and keeps the most recent examples", () => {
    const f = buildFeedback([clip("1", "a"), clip("2", "b", -1)])!;
    expect(f.examples.liked.map((c) => c.platformVideoId)).toEqual(["1"]);
    expect(f.examples.disliked.map((c) => c.platformVideoId)).toEqual(["2"]);
  });
});

describe("feedbackFactor", () => {
  const f = buildFeedback([clip("1", "Liker"), clip("2", "hater", -1)]);
  it("moves the voted clip most, then its creator's other clips", () => {
    expect(feedbackFactor({ platform: "tiktok", platformVideoId: "1", creatorHandle: "liker" }, f)).toBe(1.4);
    expect(feedbackFactor({ platform: "tiktok", platformVideoId: "9", creatorHandle: "liker" }, f)).toBe(1.25);
    expect(feedbackFactor({ platform: "tiktok", platformVideoId: "2", creatorHandle: "hater" }, f)).toBe(0.3);
    expect(feedbackFactor({ platform: "tiktok", platformVideoId: "8", creatorHandle: "hater" }, f)).toBe(0.75);
    expect(feedbackFactor({ platform: "youtube", platformVideoId: "1", creatorHandle: "liker" }, f)).toBe(1);
  });
});

describe("withFeedback", () => {
  it("reorders inside a label tier but never across tiers", () => {
    const f = buildFeedback([clip("1", "a", -1)]);
    const score = withFeedback((v: { platform: string; platformVideoId: string; creatorHandle: string; s: number }) => v.s, f);
    const disliked = { platform: "tiktok", platformVideoId: "1", creatorHandle: "a", s: 2e12 + 900 };
    const other = { platform: "tiktok", platformVideoId: "2", creatorHandle: "b", s: 2e12 + 500 };
    const lowerTier = { platform: "tiktok", platformVideoId: "3", creatorHandle: "c", s: 1e12 + 999 };
    expect(score(other)).toBeGreaterThan(score(disliked));
    expect(score(disliked)).toBeGreaterThan(score(lowerTier));
  });
});
