import { beforeEach, describe, expect, it, vi } from "vitest";

// The search on the saved vendor fixtures (USE_FIXTURES), with the AI and the database mocked: no network, no credits.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/usage", () => ({ logApiCall: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  getFreshCreator: vi.fn(async () => null),
  getCreatorVideos: vi.fn(async () => []),
  saveCreator: vi.fn(async () => {}),
  saveVideos: vi.fn(async () => new Map()),
}));

// Set by each test: the creator the AI calls unrelated (fit 0).
let offCreator = "";
vi.mock("@/lib/ai/tasks", () => ({
  // Every clip is "inside the field" (1), so only the creator check can drop one.
  rateRelevance: vi.fn(async (_p: unknown, videos: unknown[]) => ({
    scores: videos.map(() => 1),
    copy: videos.map(() => 2),
    brand: videos.map(() => false),
  })),
  rateCreators: vi.fn(async (_p: unknown, creators: { key: string; handle: string }[]) => {
    return new Map(creators.map((c) => [c.key, { fit: c.handle === offCreator ? 0 : 2, type: "creator", why: "test" }]));
  }),
  pickRelevantAccounts: vi.fn(async () => []),
}));

process.env.USE_FIXTURES = "true";
const { adapters } = await import("@/lib/adapters");
const { searchKeywords } = await import("./search");

const product = { name: "AccOS Pro", whatItIs: "Accounting software for Thai SMEs", audience: "SME owners" };

describe("searchKeywords with creator relevance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drops an unrelated account's clips and never looks it up", async () => {
    // Pick the busiest TikTok creator in the fixture as the "unrelated" one.
    const first = await searchKeywords([{ text: "บัญชี", region: "th" }], ["tiktok"], [], { product, minViews: 0 });
    const counts = new Map<string, number>();
    for (const v of first.videos) counts.set(v.creatorHandle, (counts.get(v.creatorHandle) ?? 0) + 1);
    offCreator = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    const offClips = counts.get(offCreator)!;

    const lookups = vi.spyOn(adapters.tiktok, "getCreatorVideos");
    const result = await searchKeywords([{ text: "บัญชี", region: "th" }], ["tiktok"], [], { product, minViews: 0 });

    expect(result.videos.some((v) => v.creatorHandle === offCreator)).toBe(false);
    expect(result.platforms.tiktok?.dropped.offCreator).toBe(offClips);
    expect(lookups.mock.calls.some(([handle]) => handle === offCreator)).toBe(false);
    expect(result.videos.every((v) => v.creatorFit === 2 && v.creatorWhy === "test")).toBe(true);
    offCreator = "";
  });
});
