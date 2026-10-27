import "server-only";
import { adapters } from "@/lib/adapters";
import { INSTAGRAM_MIN_DAYS, instagramReels } from "@/lib/adapters/instagram-scrapecreators";
import { DEFAULT_WINDOW, type NormalizedVideo, type Platform, type SearchRegion } from "@/lib/adapters/types";
import type { SearchSettings } from "@/lib/search-settings";
import { type ProductBrief, rateRelevance } from "@/lib/ai/tasks";
import { getCreatorVideos, getFreshCreator, saveCreator, saveVideos } from "@/lib/cache";
import { clipKey, type Feedback, withFeedback } from "@/lib/feedback";
import { type Goal, goalScore } from "@/lib/goals";
import { captionLanguage } from "@/lib/region";
import { isBrandAccount, isExcluded, isOwnAccount, relevanceKeep, STRICT_RELEVANCE_AT } from "@/lib/results";
import {
  labelFor,
  type OutlierLabel,
  passesNoiseFilter,
  reachScore,
  usualScore,
  usualViewsExcluding,
} from "@/lib/scoring";


/** Max creators per platform that get a usual-views lookup (CLAUDE.md cost rule 3). */
const BASELINE_CREATORS = 5;
/** A Reels-only research (no TikTok credits spent) looks up more Instagram creators: 1 credit each. */
const BASELINE_CREATORS_REELS_ONLY = 8;

/**
 * Instagram search returns only ~12 reels per keyword, so the creators looked up for usual views (their feed is
 * already paid for) also add their own standout reels: at least 2x their usual views, after the same relevance check.
 */
const FEED_EXTRA_PLATFORMS: Platform[] = ["instagram"];
/** The top Instagram creators get 3 pages of reels (~36, +2 credits each), so their older hits are found too. */
const IG_DEEP_CREATORS = 3;
const IG_DEEP_PAGES = 3;
/**
 * Instagram can't be searched in Thai through ScrapeCreators (popular answers nothing, reels search returns
 * unrelated clips; checked 2026-10-27). Thai TikTok creators often use the same handle on Instagram, so up to 4 of
 * them are tried there: a handle that doesn't exist costs nothing, one that does costs 1 credit.
 */
const IG_FROM_TIKTOK = 4;
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

export type DropReason = "views" | "old" | "language" | "excluded" | "offTopic";
export type PlatformStats = {
  found: number;
  kept: number;
  dropped: Partial<Record<DropReason, number>>;
  /** Extra clips from the looked-up creators' own feeds (counted apart from `kept`). */
  fromFeeds?: number;
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

async function creatorBaseline(platform: Platform, handle: string, deep = false) {
  const cached = await getFreshCreator(platform, handle);
  if (cached?.usualViews) return { usualViews: cached.usualViews, recent: null, feed: null };

  const recent =
    platform === "instagram" && deep ? await instagramReels(handle, IG_DEEP_PAGES) : await adapters[platform].getCreatorVideos(handle);
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

/** One looked-up creator's standout clips that the keyword search missed (no paid calls: the feed is already here). */
async function feedPicks(
  platform: Platform,
  handle: string,
  base: Baseline,
  skip: (v: NormalizedVideo) => boolean,
): Promise<NormalizedVideo[]> {
  const feed = base.feed ?? (await getCreatorVideos(platform, handle));
  const posts = base.recent ?? feed.map((v) => ({ id: v.platformVideoId, views: v.views }));
  return feed
    .filter((v) => !skip(v))
    .map((v) => ({ v, usual: usualScore(v.views, usualViewsExcluding(posts, v.platformVideoId)) ?? 0 }))
    .filter((x) => x.usual >= FEED_EXTRA_MIN_USUAL)
    .sort((a, b) => b.usual - a.usual)
    .slice(0, FEED_EXTRAS_PER_CREATOR)
    .map((x) => x.v);
}

/**
 * Searches each keyword on each platform (1 page each), drops excluded and noisy videos,
 * adds both outlier scores for the top creators, saves to the shared cache and ranks the results.
 */
export async function searchKeywords(
  keywords: KeywordQuery[],
  platforms: Platform[] = ["tiktok", "youtube"],
  exclusions: string[] = [],
  opts: SearchSettings & { product?: ProductBrief; goal?: Goal | null; feedback?: Feedback | null } = {},
): Promise<SearchResult> {
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
  const rated = opts.product ? await rateRelevance(opts.product, clean, opts.goal, opts.feedback?.examples) : null;
  const relevance = rated?.scores ?? null;
  const copyOf = new Map(clean.map((v, i) => [v, rated?.copy[i] ?? null]));
  const brandOf = new Map(clean.map((v, i) => [v, !!rated?.brand[i] || isBrandAccount(v.creatorHandle, opts.product?.competitors)]));
  const keep = relevance ? relevanceKeep(relevance) : null;
  const kept = keep ? clean.filter((_, i) => keep[i]) : clean;
  clean.forEach((v, i) => {
    if (keep && !keep[i]) statOf(v.platform).dropped.offTopic = (statOf(v.platform).dropped.offTopic ?? 0) + 1;
  });
  kept.forEach((v) => statOf(v.platform).kept++);
  const dbIds = await saveVideos(kept);

  // Usual-views baselines for the top creators (by reach, or by views where followers are unknown, as on Instagram),
  // plus up to 2 similar-product accounts per platform. All platforms at once: Instagram feeds can take ~20 s.
  const baselines = new Map<string, Baseline>();
  const similar = new Set<string>();
  const reelsOnly = !platforms.includes("tiktok");
  await Promise.all(
    platforms.map(async (p) => {
      const ranked = kept
        .filter((v) => v.platform === p)
        .sort(
          (a, b) =>
            (reachScore(b.views, b.creatorFollowers) ?? 0) - (reachScore(a.views, a.creatorFollowers) ?? 0) ||
            (b.views ?? 0) - (a.views ?? 0),
        );
      const brands = [...new Set(ranked.filter((v) => brandOf.get(v)).map((v) => v.creatorHandle))].slice(0, SIMILAR_ACCOUNTS);
      brands.forEach((h) => similar.add(`${p}:${h}`));
      const top = [
        ...new Set([
          ...[...new Set(ranked.map((v) => v.creatorHandle))].slice(0, p === "instagram" && reelsOnly ? BASELINE_CREATORS_REELS_ONLY : BASELINE_CREATORS),
          ...brands,
        ]),
      ];
      await Promise.all(
        top.map(async (handle, n) => {
          try {
            baselines.set(`${p}:${handle}`, await creatorBaseline(p, handle, p === "instagram" && n < IG_DEEP_CREATORS));
          } catch (e) {
            errors.push(`${p} @${handle}: ${(e as Error).message}`);
          }
        }),
      );
    }),
  );

  // Thai Reels that search can't reach: Thai TikTok creators from this run, tried under the same Instagram handle.
  const crossKeyword = new Map<string, string>();
  if (opts.product && relevance && platforms.includes("instagram") && platforms.includes("tiktok") && thaiKeywords.size) {
    const tiktokThai = kept
      .filter((v) => v.platform === "tiktok" && captionLanguage(v) === "th" && !baselines.has(`instagram:${v.creatorHandle}`))
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    const handles = [...new Set(tiktokThai.map((v) => v.creatorHandle))].slice(0, IG_FROM_TIKTOK);
    await Promise.all(
      handles.map(async (handle) => {
        const base = await creatorBaseline("instagram", handle).catch(() => null);
        if (!base || (base.feed !== null && !base.feed.length)) return;
        baselines.set(`instagram:${handle}`, base);
        crossKeyword.set(handle, tiktokThai.find((v) => v.creatorHandle === handle)?.keyword ?? "");
      }),
    );
  }

  // More clips from the creators just looked up (Instagram creators, and similar-product accounts everywhere).
  // Needs the relevance check (a product), and drops nothing when it fails.
  const extras: (NormalizedVideo & { keyword: string })[] = [];
  if (opts.product && relevance) {
    const skip = (v: NormalizedVideo) =>
      seen.has(`${v.platform}:${v.platformVideoId}`) ||
      !!disliked?.has(clipKey(v)) ||
      isOwnAccount(v.creatorHandle, opts.product!.name) ||
      !!dropReason(v, {
        minViews: opts.minViews ?? 0,
        sinceMs: v.platform === "instagram" ? igSince : since,
        language: opts.language,
        exclusions,
        thaiSearch: false,
      });
    const picks = await Promise.all(
      [...baselines].map(async ([key, base]) => {
        const [p, handle] = [key.slice(0, key.indexOf(":")) as Platform, key.slice(key.indexOf(":") + 1)];
        if (!FEED_EXTRA_PLATFORMS.includes(p) && !similar.has(key)) return [];
        // Labelled with the keyword that found this creator.
        const keyword = kept.find((v) => v.platform === p && v.creatorHandle === handle)?.keyword ?? crossKeyword.get(handle) ?? "";
        return (await feedPicks(p, handle, base, skip).catch(() => [])).map((v) => ({ ...v, keyword }));
      }),
    );
    const candidates = picks.flat();
    const extraRated = candidates.length
      ? await rateRelevance(opts.product, candidates, opts.goal, opts.feedback?.examples)
      : null;
    // Same bar as the search results: score 2 only when there were plenty of clear matches.
    const minScore = relevance.filter((s) => s === 2).length >= STRICT_RELEVANCE_AT ? 2 : 1;
    candidates.forEach((v, i) => {
      if ((extraRated?.scores[i] ?? 0) < minScore) return;
      extras.push(v);
      copyOf.set(v, extraRated?.copy[i] ?? null);
      const s = statOf(v.platform);
      s.fromFeeds = (s.fromFeeds ?? 0) + 1;
    });
    (await saveVideos(extras)).forEach((id, key) => dbIds.set(key, id));
  }

  const rank = withFeedback((v: ScoredVideo) => goalScore(v, opts.goal), opts.feedback ?? null);
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
