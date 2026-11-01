import "server-only";
import { adapters } from "@/lib/adapters";
import { INSTAGRAM_MIN_DAYS, instagramReels, instagramSearchAccounts } from "@/lib/adapters/instagram-scrapecreators";
import { DEFAULT_WINDOW, type NormalizedVideo, type Platform, type SearchRegion } from "@/lib/adapters/types";
import type { SearchSettings } from "@/lib/search-settings";
import type { AccountType } from "@/lib/ai/schemas";
import { type CreatorFit, pickRelevantAccounts, type ProductBrief, rateCreators, rateRelevance, suggestInstagramAccounts } from "@/lib/ai/tasks";
import { getCreatorVideos, getFreshCreator, saveCreator, saveVideos } from "@/lib/cache";
import { clipKey, type Feedback, withFeedback } from "@/lib/feedback";
import { type Goal, goalScore } from "@/lib/goals";
import { captionLanguage } from "@/lib/region";
import { creditsSoFar } from "@/lib/run-context";
import { dropForCreator, isBrandAccount, isExcluded, isOwnAccount, relevanceKeep, STRICT_RELEVANCE_AT, withCreatorFit } from "@/lib/results";
import {
  labelFor,
  type OutlierLabel,
  passesNoiseFilter,
  reachScore,
  usualScore,
  usualViewsExcluding,
} from "@/lib/scoring";


/** Max TikTok / YouTube creators per platform that get a usual-views lookup (CLAUDE.md cost rule 3). */
const BASELINE_CREATORS = 5;

/**
 * Instagram, creator-first (cost rule 11). Its keyword search is thin, so Reels come from seed accounts' feeds:
 * 2 pages each (~24 reels, 1 credit a page; a missing profile is free), 4 accounts first (mixed sources) and up to
 * 10 when they gave on-topic Reels and the run is still quick, never past IG_CREDIT_CAP Instagram credits in a research
 * (keyword and account searches included). A reel counts at 2x+ its own account's usual views (from 8+ reels), with
 * no absolute floor beyond 1K views; up to 4 per account, then the relevance check.
 */
const IG_CREDIT_CAP = 25;
const IG_SEED_PAGES = 2;
const IG_FIRST_STEP = 4;
const IG_MAX_ACCOUNTS = 10;
const IG_SECOND_STEP_AFTER = 2;
const IG_SECOND_STEP_BEFORE_MS = 55_000;
const IG_PICKS_PER_ACCOUNT = 4;
const IG_MIN_SAMPLE = 8;
const IG_SANITY_VIEWS = 1_000;
/** Instagram's account search (1 credit, ~15 s; understands Thai): up to 3 keywords, AI keeps up to 4 accounts. */
const IG_ACCOUNT_SEARCHES = 3;
const IG_ACCOUNTS = 4;
/** This run's on-topic TikTok / YouTube accounts tried under the same Instagram handle. */
const IG_CROSS_PLATFORM = 4;

export type SeedSource = "known" | "search" | "keyword" | "suggested" | "cross";
type Seed = { handle: string; source: SeedSource; keyword: string };
const SEED_ORDER: SeedSource[] = ["known", "search", "keyword", "suggested", "cross"];

/**
 * The accounts read first: known creators (up to 2), then one from each other source in turn (search, keyword,
 * suggested, cross, again…), so one weak source can't take the whole first step. Measured 2026-11-01: a first step of
 * 4 account-search results found 1 on-topic Reel for a Thai accounting brief, and the other sources were never tried.
 */
export function firstStep<T extends { source: SeedSource }>(seeds: T[], n: number): T[] {
  const picked: T[] = seeds.filter((s) => s.source === "known").slice(0, Math.min(2, n));
  const queues = SEED_ORDER.filter((s) => s !== "known").map((source) => seeds.filter((s) => s.source === source));
  while (picked.length < n && queues.some((q) => q.length)) {
    for (const q of queues) if (q.length && picked.length < n) picked.push(q.shift()!);
  }
  return picked;
}

/** Seeds best first (known > search > keyword > suggested > cross), each handle once (its best source wins). */
export function orderSeeds<T extends { handle: string; source: SeedSource }>(seeds: T[]): T[] {
  const best = new Map<string, T>();
  for (const s of seeds) {
    const key = s.handle.toLowerCase();
    const had = best.get(key);
    if (!had || SEED_ORDER.indexOf(s.source) < SEED_ORDER.indexOf(had.source)) best.set(key, s);
  }
  return [...best.values()].sort((a, b) => SEED_ORDER.indexOf(a.source) - SEED_ORDER.indexOf(b.source));
}
/**
 * Accounts that are themselves a product like the user's (an app or brand promoting itself, flagged by the relevance
 * check or matching a competitor's name): up to 2 per platform get a usual-views lookup even outside the top creators,
 * and their own standout clips join the results on every platform. Max +2 credits on Instagram, +4 on TikTok.
 */
const SIMILAR_ACCOUNTS = 2;

export type SimilarAccount = { platform: Platform; handle: string; usualViews: number | null };
const FEED_EXTRA_MIN_USUAL = 2;
const FEED_EXTRAS_PER_CREATOR = 3;

export type ScoredVideo = NormalizedVideo & {
  reach: number | null;
  usual: number | null;
  usualViews: number | null;
  label: OutlierLabel;
  keyword: string;
  /** Row id in the shared videos table, when Supabase is configured. */
  dbId?: number;
  /** How easily a small business could film a similar clip (AI): 2 easy, 1 needs production, 0 can't be copied. */
  copyable?: number | null;
  /** How well the ACCOUNT fits the product (AI, from its captions): 2 in the field, 1 same audience, 0 unrelated. */
  creatorFit?: number | null;
  accountType?: AccountType | null;
  /** What the account mostly posts (shown on the card). */
  creatorWhy?: string | null;
};

export type SearchResult = {
  videos: ScoredVideo[];
  /** Dropped by the noise filter or exclusions. */
  hidden: number;
  /** Dropped by the AI relevance check. */
  offTopic: number;
  /** Per platform: how many were found, kept, and why the rest were dropped (shown under the results). */
  platforms: Partial<Record<Platform, PlatformStats>>;
  errors: string[];
  /** The AI relevance check could not run (Gemini busy), so nothing was filtered out: the page offers a re-check. */
  relevanceFailed: boolean;
  /** Similar products' own accounts found in this run (shown in their own section). */
  similarAccounts: SimilarAccount[];
};

export type DropReason = "views" | "old" | "language" | "excluded" | "offTopic" | "offCreator";
export type PlatformStats = {
  found: number;
  kept: number;
  dropped: Partial<Record<DropReason, number>>;
  /** Extra clips from the looked-up creators' own feeds (counted apart from `kept`). */
  fromFeeds?: number;
  /** Older researches: of those, from Instagram's account search. */
  fromAccounts?: number;
  /** Instagram: seed accounts whose reels were read, and where they came from. */
  accountsChecked?: number;
  seeds?: Partial<Record<SeedSource, number>>;
};

/** Why a video did not make it, checked in this order (the first failing rule is the reason). */
function dropReason(
  v: NormalizedVideo,
  rules: { minViews: number; sinceMs: number; language?: string; exclusions: string[]; thaiSearch: boolean },
): DropReason | null {
  if (!passesNoiseFilter(v.views, v.creatorFollowers) || (v.views ?? 0) < rules.minViews) return "views";
  if (v.publishedAt && new Date(v.publishedAt).getTime() < rules.sinceMs) return "old";
  const lang = captionLanguage(v);
  if (rules.language && rules.language !== "any" && lang !== rules.language) return "language";
  // A Thai search keeps Thai and English captions (Top search also returns other languages).
  if ((!rules.language || rules.language === "any") && rules.thaiSearch && lang && lang !== "th" && lang !== "en") return "language";
  if (isExcluded(v.caption, rules.exclusions)) return "excluded";
  return null;
}
/** `english`: the same phrase in English, for Instagram (its popular search only understands English). */
export type KeywordQuery = { text: string; region: SearchRegion; english?: string };

/** `igPages`: pages of reels to read for an Instagram creator (1 credit each); TikTok and YouTube ignore it. */
async function creatorBaseline(platform: Platform, handle: string, igPages = 1) {
  const cached = await getFreshCreator(platform, handle);
  if (cached?.usualViews) return { usualViews: cached.usualViews, recent: null, feed: null };

  const recent =
    platform === "instagram" && igPages > 1 ? await instagramReels(handle, igPages) : await adapters[platform].getCreatorVideos(handle);
  const posts = recent.map((v) => ({ id: v.platformVideoId, views: v.views }));
  const usualViews = usualViewsExcluding(posts);
  if (recent.length) {
    // Keep the posts too: the tracking page reads an account's recent videos from this cache.
    await saveVideos(recent);
    await saveCreator(platform, handle, {
      followers: recent[0].creatorFollowers,
      usualViews,
      sampleSize: recent.length,
      displayName: recent[0].creatorName,
    });
  }
  return { usualViews, recent: posts, feed: recent };
}

type Baseline = Awaited<ReturnType<typeof creatorBaseline>>;

/**
 * One looked-up creator's standout clips that the keyword search missed (no paid calls: the feed is already here):
 * 2x+ the creator's usual views, best first. `minSample`: skip creators with fewer reels with views than this (a
 * median of 3 posts says little).
 */
export async function feedPicks(
  platform: Platform,
  handle: string,
  base: Baseline,
  skip: (v: NormalizedVideo) => boolean,
  { perCreator = FEED_EXTRAS_PER_CREATOR, minSample = 0 }: { perCreator?: number; minSample?: number } = {},
): Promise<NormalizedVideo[]> {
  const feed = base.feed ?? (await getCreatorVideos(platform, handle));
  const posts = base.recent ?? feed.map((v) => ({ id: v.platformVideoId, views: v.views }));
  if (posts.filter((p) => p.views !== null).length < minSample) return [];
  return feed
    .filter((v) => !skip(v))
    .map((v) => ({ v, usual: usualScore(v.views, usualViewsExcluding(posts, v.platformVideoId)) ?? 0 }))
    .filter((x) => x.usual >= FEED_EXTRA_MIN_USUAL)
    .sort((a, b) => b.usual - a.usual)
    .slice(0, perCreator)
    .map((x) => x.v);
}

/** Creators rated per research (the busiest first), and captions shown to the AI for each. */
const CREATORS_RATED = 80;
const CAPTIONS_PER_CREATOR = 6;

/**
 * Rates the accounts behind a run's clips (one AI call per 40, no credits; runs alongside the clip check). Each account
 * is shown with up to 6 captions: its clips in this run first, then its other posts already in the shared cache.
 */
async function creatorFits(
  clips: (NormalizedVideo & { keyword: string })[],
  product: ProductBrief,
  goal: Goal | null | undefined,
  locale = "th",
): Promise<Map<string, CreatorFit> | null> {
  const byCreator = new Map<string, { platform: Platform; handle: string; captions: string[]; views: number }>();
  for (const v of clips) {
    const key = `${v.platform}:${v.creatorHandle}`;
    const c = byCreator.get(key) ?? { platform: v.platform, handle: v.creatorHandle, captions: [], views: 0 };
    if (v.caption.trim() && c.captions.length < CAPTIONS_PER_CREATOR) c.captions.push(v.caption);
    c.views += v.views ?? 0;
    byCreator.set(key, c);
  }
  const creators = [...byCreator]
    .sort((a, b) => b[1].captions.length - a[1].captions.length || b[1].views - a[1].views)
    .slice(0, CREATORS_RATED);
  await Promise.all(
    creators.map(async ([, c]) => {
      if (c.captions.length >= CAPTIONS_PER_CREATOR) return;
      const cached = await getCreatorVideos(c.platform, c.handle, CAPTIONS_PER_CREATOR).catch(() => []);
      for (const p of cached) {
        if (c.captions.length >= CAPTIONS_PER_CREATOR) break;
        if (p.caption.trim() && !c.captions.includes(p.caption)) c.captions.push(p.caption);
      }
    }),
  );
  return rateCreators(
    product,
    creators.map(([key, c]) => ({ key, platform: c.platform, handle: c.handle, captions: c.captions.length ? c.captions : ["(no caption)"] })),
    goal,
    locale,
  );
}

/**
 * Searches each keyword on each platform (1 page each), drops excluded and noisy videos,
 * adds both outlier scores for the top creators, saves to the shared cache and ranks the results.
 */
export async function searchKeywords(
  keywords: KeywordQuery[],
  platforms: Platform[] = ["tiktok", "youtube"],
  exclusions: string[] = [],
  opts: SearchSettings & {
    product?: ProductBrief;
    goal?: Goal | null;
    feedback?: Feedback | null;
    locale?: string;
    /** Instagram accounts this user's earlier researches for the product found on topic (seeds, free). */
    knownInstagram?: string[];
  } = {},
): Promise<SearchResult> {
  const started = Date.now();
  const days = opts.days ?? DEFAULT_WINDOW;
  const since = Date.now() - days * 864e5;
  const errors: string[] = [];
  const igSince = Date.now() - Math.max(days, INSTAGRAM_MIN_DAYS) * 864e5;
  // Alternate the two rankings that surface viral videos: most-liked and the platform's "Top" (same cost).
  // Instagram searches the English phrase, once per distinct phrase.
  const queried = new Set<string>();
  const jobs = keywords.flatMap(({ text: keyword, region, english }, i) =>
    platforms.map(async (p) => {
      const query = p === "instagram" ? english || keyword : keyword;
      if (queried.has(`${p}:${query.toLowerCase()}`)) return [];
      queried.add(`${p}:${query.toLowerCase()}`);
      try {
        const order = i % 2 === 0 ? "popular" : "top";
        const found = await adapters[p].searchVideos(query, { region, days, order });
        return found.map((v) => ({ ...v, keyword }));
      } catch (e) {
        errors.push(`${p} "${keyword}": ${(e as Error).message}`);
        return [];
      }
    }),
  );

  // Instagram seed accounts, started now so they overlap the keyword search: Instagram's own account search (it
  // understands Thai; Thai keywords as typed, worldwide ones in English) and accounts the AI knows for the category.
  const igOn = !!opts.product && platforms.includes("instagram");
  const accountQueries = [...new Set(keywords.map((k) => (k.region === "th" ? k.text : k.english || k.text)))].slice(0, IG_ACCOUNT_SEARCHES);
  const igAccountsJob = igOn
    ? Promise.all(
        accountQueries.map((q) =>
          instagramSearchAccounts(q)
            .then((list) => list.map((a) => ({ ...a, keyword: q })))
            .catch((e) => {
              errors.push(`instagram accounts "${q}": ${(e as Error).message}`);
              return [];
            }),
        ),
      ).then((lists) => lists.flat())
    : Promise.resolve([]);
  const regions = new Set(keywords.map((k) => k.region));
  const igSuggestJob = igOn
    ? suggestInstagramAccounts(opts.product!, opts.goal, regions.size > 1 ? "both" : [...regions][0] === "th" ? "th" : "global")
    : Promise.resolve([] as string[]);

  // Dedupe across keywords: the first keyword that found a video keeps it.
  const seen = new Set<string>();
  const all = (await Promise.all(jobs)).flat().filter((v) => {
    const key = `${v.platform}:${v.platformVideoId}`;
    return !seen.has(key) && seen.add(key);
  });

  // Platforms filter dates loosely (Instagram only knows "last year"), so enforce the window here too.
  const thaiKeywords = new Set(keywords.filter((k) => k.region === "th").map((k) => k.text));
  const stats: Partial<Record<Platform, PlatformStats>> = {};
  const statOf = (p: Platform) => (stats[p] ??= { found: 0, kept: 0, dropped: {} });
  const clean = all.filter((v) => {
    const s = statOf(v.platform);
    s.found++;
    const reason = dropReason(v, {
      minViews: opts.minViews ?? 0,
      sinceMs: v.platform === "instagram" ? igSince : since,
      language: opts.language,
      exclusions,
      thaiSearch: thaiKeywords.has(v.keyword),
    });
    if (reason) s.dropped[reason] = (s.dropped[reason] ?? 0) + 1;
    return !reason;
  });
  // The user's own account (e.g. @accospro.app for AccOS Pro) is not something to learn from: leave it out quietly.
  const own = opts.product ? clean.filter((v) => isOwnAccount(v.creatorHandle, opts.product!.name)) : [];
  if (own.length) {
    own.forEach((v) => statOf(v.platform).found--);
    clean.splice(0, clean.length, ...clean.filter((v) => !own.includes(v)));
  }
  // Clips the user marked 👎 for this product never come back.
  const disliked = opts.feedback?.disliked;
  if (disliked?.size) clean.splice(0, clean.length, ...clean.filter((v) => !disliked.has(clipKey(v))));
  // AI relevance check before any paid baseline lookups, so off-topic creators cost nothing.
  // Score 1 ("same audience, not the product") only fills in when there are few clearly on-topic videos.
  // The ACCOUNTS behind the clips are rated at the same time (from a few of their captions: this run's plus posts
  // already cached), so the two AI calls overlap instead of adding up when the models are slow.
  const [rated, fits] = await Promise.all([
    opts.product ? rateRelevance(opts.product, clean, opts.goal, opts.feedback?.examples) : null,
    opts.product ? creatorFits(clean, opts.product, opts.goal, opts.locale) : null,
  ]);
  const relevance = rated?.scores ?? null;
  const copyOf = new Map(clean.map((v, i) => [v, rated?.copy[i] ?? null]));
  const brandOf = new Map(clean.map((v, i) => [v, !!rated?.brand[i] || isBrandAccount(v.creatorHandle, opts.product?.competitors)]));
  const keep = relevance ? relevanceKeep(relevance) : null;
  let kept = keep ? clean.filter((_, i) => keep[i]) : clean;
  clean.forEach((v, i) => {
    if (keep && !keep[i]) statOf(v.platform).dropped.offTopic = (statOf(v.platform).dropped.offTopic ?? 0) + 1;
  });
  const relevanceOf = new Map(clean.map((v, i) => [v, relevance?.[i] ?? null]));

  // Before any paid lookup: credits go to on-topic accounts, and an unrelated account's clips go unless the clip
  // itself is clearly on topic (only when the clip check worked too, so a failed check never drops anything).
  const fitOf = (v: { platform: Platform; creatorHandle: string }) => fits?.get(`${v.platform}:${v.creatorHandle}`) ?? null;
  if (fits && relevance) {
    kept = kept.filter((v) => {
      if (!dropForCreator(fitOf(v)?.fit, relevanceOf.get(v))) return true;
      const s = statOf(v.platform);
      s.dropped.offCreator = (s.dropped.offCreator ?? 0) + 1;
      return false;
    });
  }
  kept.forEach((v) => statOf(v.platform).kept++);
  const dbIds = await saveVideos(kept);

  // Usual-views lookups, by "platform:handle".
  const baselines = new Map<string, Baseline>();
  // Same bar for clips found in feeds as for the search results: score 2 only when there were plenty of clear matches.
  const minScore = relevance && relevance.filter((s) => s === 2).length >= STRICT_RELEVANCE_AT ? 2 : 1;
  // A feed clip must not repeat a result, a 👎 clip or the product's own account, and must pass the usual rules.
  const skipWith = (minViews: number) => (v: NormalizedVideo) =>
    seen.has(`${v.platform}:${v.platformVideoId}`) ||
    !!disliked?.has(clipKey(v)) ||
    (!!opts.product && isOwnAccount(v.creatorHandle, opts.product.name)) ||
    !!dropReason(v, {
      minViews,
      sinceMs: v.platform === "instagram" ? igSince : since,
      language: opts.language,
      exclusions,
      thaiSearch: false,
    });

  // Usual-views baselines for the top TikTok and YouTube creators (on-topic accounts first, then reach), plus up to 2
  // similar-product accounts per platform. Instagram is found through its accounts instead (below), at the same time.
  const similar = new Set<string>();
  const otherPlatforms = Promise.all(
    platforms
      .filter((p) => p !== "instagram")
      .map(async (p) => {
        // Unknown fit counts as 1; unrelated accounts get no paid lookup.
        const ranked = kept
          .filter((v) => v.platform === p && fitOf(v)?.fit !== 0)
          .sort(
            (a, b) =>
              (fitOf(b)?.fit ?? 1) - (fitOf(a)?.fit ?? 1) ||
              (reachScore(b.views, b.creatorFollowers) ?? 0) - (reachScore(a.views, a.creatorFollowers) ?? 0) ||
              (b.views ?? 0) - (a.views ?? 0),
          );
        const isBrand = (v: (typeof ranked)[number]) => brandOf.get(v) || fitOf(v)?.type === "brand";
        const brands = [...new Set(ranked.filter(isBrand).map((v) => v.creatorHandle))].slice(0, SIMILAR_ACCOUNTS);
        brands.forEach((h) => similar.add(`${p}:${h}`));
        const top = [...new Set([...[...new Set(ranked.map((v) => v.creatorHandle))].slice(0, BASELINE_CREATORS), ...brands])];
        await Promise.all(
          top.map(async (handle) => {
            try {
              baselines.set(`${p}:${handle}`, await creatorBaseline(p, handle));
            } catch (e) {
              errors.push(`${p} @${handle}: ${(e as Error).message}`);
            }
          }),
        );
      }),
  );

  // Instagram, creator-first: its keyword search is thin (~12 reels a keyword, English only), so Reels come from the
  // right ACCOUNTS' feeds. Seeds, best first: accounts this user's earlier researches found on topic (free), Instagram's
  // account search kept by the AI, this run's on-topic Instagram creators, accounts the AI knows for the category (a
  // made-up handle costs nothing), then this run's on-topic TikTok / YouTube accounts under the same handle.
  // Read in steps within IG_CREDIT_CAP: 4 accounts first; more only when they gave on-topic Reels and time allows.
  const igFeedClips: (NormalizedVideo & { keyword: string })[] = [];
  const igStats = { accountsChecked: 0, seeds: {} as Partial<Record<SeedSource, number>> };
  const igWork = (async () => {
    if (!igOn || !relevance) return;
    const product = opts.product!;
    const [accounts, suggested] = await Promise.all([igAccountsJob, igSuggestJob]);
    const fresh = accounts.filter((a, i) => accounts.findIndex((b) => b.handle === a.handle) === i && !isOwnAccount(a.handle, product.name));
    const searched = fresh.length ? await pickRelevantAccounts(product, fresh.slice(0, 30), IG_ACCOUNTS) : [];
    const firstKeyword = keywords[0]?.text ?? "";
    const keywordOf = (p: Platform, handle: string) => kept.find((v) => v.platform === p && v.creatorHandle === handle)?.keyword;
    const onTopic = (p: Platform) =>
      [...new Set(kept.filter((v) => v.platform === p && fitOf(v)?.fit === 2).sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).map((v) => v.creatorHandle))];
    const igKeywordCreators = [
      ...new Set(
        kept
          .filter((v) => v.platform === "instagram" && fitOf(v)?.fit !== 0)
          .sort((a, b) => (fitOf(b)?.fit ?? 1) - (fitOf(a)?.fit ?? 1) || (b.views ?? 0) - (a.views ?? 0))
          .map((v) => v.creatorHandle),
      ),
    ];
    const seeds = orderSeeds([
      ...(opts.knownInstagram ?? []).map((handle) => ({ handle, source: "known" as const, keyword: firstKeyword })),
      ...searched.map((handle) => ({ handle, source: "search" as const, keyword: fresh.find((a) => a.handle === handle)?.keyword ?? firstKeyword })),
      ...igKeywordCreators.map((handle) => ({ handle, source: "keyword" as const, keyword: keywordOf("instagram", handle) ?? firstKeyword })),
      ...suggested.map((handle) => ({ handle, source: "suggested" as const, keyword: firstKeyword })),
      ...(["tiktok", "youtube"] as const)
        .flatMap((p) => onTopic(p).map((handle) => ({ handle, source: "cross" as const, keyword: keywordOf(p, handle) ?? firstKeyword })))
        .slice(0, IG_CROSS_PLATFORM),
    ]).filter((s) => !isOwnAccount(s.handle, product.name));

    // Reads a batch of seed accounts (2 pages each, 1 credit a page; a missing profile is free), takes each one's
    // standout reels (2x+ its own usual views, from 8+ reels; no absolute floor beyond 1K) and keeps the on-topic ones.
    const skipIg = skipWith(IG_SANITY_VIEWS);
    const mine = async (batch: Seed[]) => {
      const picked: (NormalizedVideo & { keyword: string })[] = [];
      await Promise.all(
        batch.map(async (s) => {
          const base = await creatorBaseline("instagram", s.handle, IG_SEED_PAGES).catch(() => null);
          if (!base || (base.feed !== null && !base.feed.length)) return;
          baselines.set(`instagram:${s.handle}`, base);
          igStats.accountsChecked++;
          igStats.seeds[s.source] = (igStats.seeds[s.source] ?? 0) + 1;
          const picks = await feedPicks("instagram", s.handle, base, skipIg, { perCreator: IG_PICKS_PER_ACCOUNT, minSample: IG_MIN_SAMPLE }).catch(() => []);
          picked.push(...picks.map((v) => ({ ...v, keyword: s.keyword })));
        }),
      );
      const rated = picked.length ? await rateRelevance(product, picked, opts.goal, opts.feedback?.examples) : null;
      const found = picked.filter((v, i) => (rated?.scores[i] ?? 0) >= minScore);
      found.forEach((v) => {
        copyOf.set(v, rated?.copy[picked.indexOf(v)] ?? null);
        seen.add(`${v.platform}:${v.platformVideoId}`);
      });
      igFeedClips.push(...found);
      return found.length;
    };
    // Accounts still affordable within the cap (cached accounts cost nothing, so this errs on the safe side).
    const affordable = () => Math.max(0, Math.floor((IG_CREDIT_CAP - creditsSoFar("instagram")) / IG_SEED_PAGES));
    const step1 = firstStep(seeds, Math.min(IG_FIRST_STEP, affordable()));
    const found1 = await mine(step1);
    if (found1 >= IG_SECOND_STEP_AFTER && Date.now() - started < IG_SECOND_STEP_BEFORE_MS) {
      const room = Math.min(IG_MAX_ACCOUNTS - step1.length, affordable());
      await mine(seeds.filter((s) => !step1.includes(s)).slice(0, room));
    }
    // Brands among the accounts read count as similar products (their own section on the results page).
    for (const s of seeds) {
      const v = kept.find((k) => k.platform === "instagram" && k.creatorHandle === s.handle);
      if (baselines.has(`instagram:${s.handle}`) && v && (brandOf.get(v) || fitOf(v)?.type === "brand")) similar.add(`instagram:${s.handle}`);
    }
  })().catch((e) => void errors.push(`instagram accounts: ${(e as Error).message}`));
  await Promise.all([otherPlatforms, igWork]);

  // More clips from similar-product accounts on TikTok and YouTube (their feeds are already here; no paid calls).
  // Needs the relevance check (a product), and drops nothing when it fails.
  const extras: (NormalizedVideo & { keyword: string })[] = [...igFeedClips];
  if (opts.product && relevance) {
    const skip = skipWith(opts.minViews ?? 0);
    const picks = await Promise.all(
      [...baselines].map(async ([key, base]) => {
        const [p, handle] = [key.slice(0, key.indexOf(":")) as Platform, key.slice(key.indexOf(":") + 1)];
        if (p === "instagram" || !similar.has(key)) return [];
        // Labelled with the keyword that found this creator.
        const keyword = kept.find((v) => v.platform === p && v.creatorHandle === handle)?.keyword ?? "";
        return (await feedPicks(p, handle, base, skip).catch(() => [])).map((v) => ({ ...v, keyword }));
      }),
    );
    const candidates = picks.flat();
    const extraRated = candidates.length ? await rateRelevance(opts.product, candidates, opts.goal, opts.feedback?.examples) : null;
    candidates.forEach((v, i) => {
      if ((extraRated?.scores[i] ?? 0) < minScore) return;
      extras.push(v);
      copyOf.set(v, extraRated?.copy[i] ?? null);
    });
    extras.forEach((v) => {
      const s = statOf(v.platform);
      s.fromFeeds = (s.fromFeeds ?? 0) + 1;
    });
    if (igOn) Object.assign(statOf("instagram"), { accountsChecked: igStats.accountsChecked, seeds: igStats.seeds });
    (await saveVideos(extras)).forEach((id, key) => dbIds.set(key, id));
  }

  // "Best for your goal", then the account's fit for the product, then the user's 👍/👎.
  const rank = withFeedback(
    withCreatorFit((v: ScoredVideo) => goalScore(v, opts.goal), (v) => v.creatorFit),
    opts.feedback ?? null,
  );
  const videos = [...kept, ...extras]
    .map((v): ScoredVideo => {
      const base = baselines.get(`${v.platform}:${v.creatorHandle}`);
      // Recompute the median without this video when we have the raw posts.
      const usualViews = base?.recent ? usualViewsExcluding(base.recent, v.platformVideoId) : (base?.usualViews ?? null);
      // Prefer the profile feed's count when it has this video: same metric as the baseline (Instagram search
      // reports "views", profile reels report "plays").
      const views = base?.recent?.find((p) => p.id === v.platformVideoId)?.views ?? v.views;
      const reach = reachScore(views, v.creatorFollowers);
      const usual = usualScore(views, usualViews);
      return {
        ...v,
        views,
        reach,
        usual,
        usualViews,
        label: labelFor(usual, reach, { views, followers: v.creatorFollowers }),
        dbId: dbIds.get(`${v.platform}:${v.platformVideoId}`),
        copyable: copyOf.get(v) ?? null,
        creatorFit: fitOf(v)?.fit ?? null,
        accountType: fitOf(v)?.type ?? null,
        creatorWhy: fitOf(v)?.why || null,
      };
    })
    // "Best for your goal" (plain best when there is no goal), nudged by the user's 👍/👎.
    .sort((a, b) => rank(b) - rank(a));

  return {
    videos,
    hidden: all.length - clean.length,
    offTopic: clean.length - kept.length,
    platforms: stats,
    errors,
    relevanceFailed: !!opts.product && clean.length > 0 && rated === null,
    similarAccounts: [...similar].map((key) => {
      const [p, handle] = [key.slice(0, key.indexOf(":")) as Platform, key.slice(key.indexOf(":") + 1)];
      return { platform: p, handle, usualViews: baselines.get(key)?.usualViews ?? null };
    }),
  };
}

/** One creator's usual views (cached 24 h; otherwise 1 credit on Instagram, 2 on TikTok). Used by "paste a clip link". */
export function lookUpCreator(platform: Platform, handle: string) {
  return creatorBaseline(platform, handle);
}

/** Single-keyword search used by the test page. */
export function searchKeyword(keyword: string, platforms?: Platform[]) {
  return searchKeywords([{ text: keyword, region: "th" }], platforms);
}
