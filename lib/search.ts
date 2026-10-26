import "server-only";
import { adapters } from "@/lib/adapters";
import { INSTAGRAM_MIN_DAYS } from "@/lib/adapters/instagram-scrapecreators";
import { DEFAULT_WINDOW, type NormalizedVideo, type Platform, type SearchRegion } from "@/lib/adapters/types";
import type { SearchSettings } from "@/lib/search-settings";
import { type ProductBrief, rateRelevance } from "@/lib/ai/tasks";
import { getFreshCreator, saveCreator, saveVideos } from "@/lib/cache";
import { type Goal, goalScore } from "@/lib/goals";
import { captionLanguage } from "@/lib/region";
import { isExcluded, isOwnAccount } from "@/lib/results";
import {
  labelFor,
  type OutlierLabel,
  passesNoiseFilter,
  reachScore,
  usualScore,
  usualViewsExcluding,
} from "@/lib/scoring";

/** With at least this many clearly on-topic results, drop the "same audience" ones (score 1). */
const STRICT_RELEVANCE_AT = 15;

/** Max creators per platform that get a usual-views lookup (CLAUDE.md cost rule 3). */
const BASELINE_CREATORS = 5;

export type ScoredVideo = NormalizedVideo & {
  reach: number | null;
  usual: number | null;
  usualViews: number | null;
  label: OutlierLabel;
  keyword: string;
  /** Row id in the shared videos table, when Supabase is configured. */
  dbId?: number;
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
};

export type DropReason = "views" | "old" | "language" | "excluded" | "offTopic";
export type PlatformStats = { found: number; kept: number; dropped: Partial<Record<DropReason, number>> };

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

async function creatorBaseline(platform: Platform, handle: string) {
  const cached = await getFreshCreator(platform, handle);
  if (cached?.usualViews) return { usualViews: cached.usualViews, recent: null };

  const recent = await adapters[platform].getCreatorVideos(handle);
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
  return { usualViews, recent: posts };
}

/**
 * Searches each keyword on each platform (1 page each), drops excluded and noisy videos,
 * adds both outlier scores for the top creators, saves to the shared cache and ranks the results.
 */
export async function searchKeywords(
  keywords: KeywordQuery[],
  platforms: Platform[] = ["tiktok", "youtube"],
  exclusions: string[] = [],
  opts: SearchSettings & { product?: ProductBrief; goal?: Goal | null } = {},
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
  // AI relevance check before any paid baseline lookups, so off-topic creators cost nothing.
  // Score 1 ("same audience, not the product") only fills in when there are few clearly on-topic videos.
  const relevance = opts.product ? await rateRelevance(opts.product, clean, opts.goal) : null;
  const onTopic = relevance ? relevance.filter((r) => r === 2).length : 0;
  const minScore = onTopic >= STRICT_RELEVANCE_AT ? 2 : 1;
  const kept = relevance ? clean.filter((_, i) => relevance[i] >= minScore) : clean;
  clean.forEach((v, i) => {
    if (relevance && relevance[i] < minScore) statOf(v.platform).dropped.offTopic = (statOf(v.platform).dropped.offTopic ?? 0) + 1;
  });
  kept.forEach((v) => statOf(v.platform).kept++);
  const dbIds = await saveVideos(kept);

  // Usual-views baselines for the top creators (by reach, or by views where followers are unknown, as on Instagram).
  const baselines = new Map<string, { usualViews: number | null; recent: { id: string; views: number | null }[] | null }>();
  for (const p of platforms) {
    const top = [
      ...new Set(
        kept
          .filter((v) => v.platform === p)
          .sort(
            (a, b) =>
              (reachScore(b.views, b.creatorFollowers) ?? 0) - (reachScore(a.views, a.creatorFollowers) ?? 0) ||
              (b.views ?? 0) - (a.views ?? 0),
          )
          .map((v) => v.creatorHandle),
      ),
    ].slice(0, BASELINE_CREATORS);
    await Promise.all(
      top.map(async (handle) => {
        try {
          baselines.set(`${p}:${handle}`, await creatorBaseline(p, handle));
        } catch (e) {
          errors.push(`${p} @${handle}: ${(e as Error).message}`);
        }
      }),
    );
  }

  const videos = kept
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
      };
    })
    // "Best for your goal" (plain best when there is no goal).
    .sort((a, b) => goalScore(b, opts.goal) - goalScore(a, opts.goal));

  return { videos, hidden: all.length - clean.length, offTopic: clean.length - kept.length, platforms: stats, errors };
}

/** Single-keyword search used by the test page. */
export function searchKeyword(keyword: string, platforms?: Platform[]) {
  return searchKeywords([{ text: keyword, region: "th" }], platforms);
}
