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
  // The one Instagram account with a saved feed fixture, plus one that doesn't exist (its feed comes back empty).
  suggestInstagramAccounts: vi.fn(async () => ["nipt.academy", "made.up.handle"]),
}));

// Set by each test: Instagram credits already spent in the research (the 25-credit cap).
let igSpent = 0;
vi.mock("@/lib/run-context", () => ({ creditsSoFar: () => igSpent }));

process.env.USE_FIXTURES = "true";
const { adapters } = await import("@/lib/adapters");
const { feedPicks, orderSeeds, searchKeywords, secondStep } = await import("./search");

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
    // What the checks said is kept for replays: every result's own score, and every found clip with why it went.
    expect(result.videos.every((v) => v.relevance === 1)).toBe(true);
    expect(result.candidates).toHaveLength(result.platforms.tiktok!.found);
    expect(result.candidates.filter((c) => c.dropReason === "offCreator")).toHaveLength(offClips);
    expect(result.candidates.filter((c) => c.dropReason === null)).toHaveLength(result.platforms.tiktok!.kept);
    expect(result.candidates.find((c) => c.dropReason === "offCreator")).toMatchObject({ relevance: 1, creatorFit: 0 });
    offCreator = "";
  });
});

describe("Instagram creator-first", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    igSpent = 0;
  });

  it("orders seeds known > search > keyword > suggested > cross, each handle once at its best source", () => {
    const seeds = orderSeeds([
      { handle: "c", source: "cross" as const },
      { handle: "s", source: "suggested" as const },
      { handle: "k", source: "known" as const },
      { handle: "S", source: "search" as const },
      { handle: "w", source: "keyword" as const },
    ]);
    // "S" and "s" are the same account: it stays once, as a search result.
    expect(seeds.map((x) => x.source)).toEqual(["known", "search", "keyword", "cross"]);
    expect(seeds[1].handle).toBe("S");
  });

  it("reads more of the best when the first step worked, and other sources when it didn't", () => {
    const seeds = orderSeeds([
      ...["s1", "s2", "s3", "s4", "s5", "s6"].map((handle) => ({ handle, source: "search" as const })),
      { handle: "w1", source: "keyword" as const },
      { handle: "g1", source: "suggested" as const },
      { handle: "g2", source: "suggested" as const },
      { handle: "c1", source: "cross" as const },
    ]);
    const first = seeds.slice(0, 4);
    const rest = seeds.slice(4);
    expect(secondStep(rest, first, true, 3).map((s) => s.handle)).toEqual(["s5", "s6", "w1"]);
    // The first 4 were all account-search results and gave little: try keyword, suggested and cross accounts.
    expect(secondStep(rest, first, false, 4).map((s) => s.handle)).toEqual(["w1", "g1", "c1", "g2"]);
  });

  it("picks reels against the account's own usual views, not an absolute floor", async () => {
    const reel = (id: string, views: number) => ({ platformVideoId: id, views, platform: "instagram", creatorHandle: "a", caption: "" }) as never;
    const feed = [reel("hit", 3_000), reel("big", 30_000), ...Array.from({ length: 8 }, (_, i) => reel(`n${i}`, i < 4 ? 700 : 25_000))];
    const base = { usualViews: null, recent: feed.map((v: { platformVideoId: string; views: number }) => ({ id: v.platformVideoId, views: v.views })), feed };
    const picks = await feedPicks("instagram", "a", base, () => false, { perCreator: 4, minSample: 8 });
    // Usual ≈ 700-25K → median ~12.8K: 30K (2.3x) qualifies, 3K doesn't; with a small account the 3K one would.
    expect(picks.map((v) => v.platformVideoId)).toContain("big");
    const small = feed.map((v: { views: number }) => ({ ...(v as object), views: v.views === 25_000 ? 600 : v.views === 30_000 ? 800 : v.views })) as never[];
    const smallBase = { usualViews: null, recent: small.map((v: { platformVideoId: string; views: number }) => ({ id: v.platformVideoId, views: v.views })), feed: small };
    expect((await feedPicks("instagram", "a", smallBase, () => false, { perCreator: 4, minSample: 8 })).map((v) => v.platformVideoId)).toEqual(["hit"]);
    // Too few reels to know the account's usual views: nothing.
    expect(await feedPicks("instagram", "a", { ...smallBase, recent: smallBase.recent.slice(0, 5) }, () => false, { minSample: 8 })).toEqual([]);
  });

  it("reads seed accounts' feeds, and stops at the credit cap", async () => {
    // nipt.academy (the one account with a saved feed) as a known creator: read first, ahead of every other seed.
    const run = () =>
      searchKeywords([{ text: "nipt test", region: "global", english: "nipt test" }], ["instagram"], [], { product, minViews: 0, knownInstagram: ["nipt.academy"] });
    const open = await run();
    expect(open.platforms.instagram?.accountsChecked).toBe(1); // seeds without a feed (e.g. a made-up handle) aren't counted
    expect(open.platforms.instagram?.seeds?.known).toBe(1);

    igSpent = 24; // one more account (2 pages) would pass 25
    const capped = await run();
    expect(capped.platforms.instagram?.accountsChecked).toBe(0);
  });
});
