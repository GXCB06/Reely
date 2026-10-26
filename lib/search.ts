import "server-only";
import { adapters } from "@/lib/adapters";
import { DEFAULT_WINDOW, type NormalizedVideo, type Platform, type SearchRegion } from "@/lib/adapters/types";
import type { SearchSettings } from "@/lib/search-settings";
import { type ProductBrief, rateRelevance } from "@/lib/ai/tasks";
import { getFreshCreator, saveCreator, saveVideos } from "@/lib/cache";
import { isExcluded } from "@/lib/results";
import {
  bestScore,
  labelFor,
  type OutlierLabel,
  passesNoiseFilter,
  reachScore,
  usualScore,
  usualViewsExcluding,
} from "@/lib/scoring";

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
  errors: string[];
};
export type KeywordQuery = { text: string; region: SearchRegion };

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
  opts: SearchSettings & { product?: ProductBrief } = {},
): Promise<SearchResult> {
  const days = opts.days ?? DEFAULT_WINDOW;
  const since = Date.now() - days * 864e5;
  const errors: string[] = [];
  const jobs = keywords.flatMap(({ text: keyword, region }) =>
    platforms.map(async (p) => {
      try {
        const found = await adapters[p].searchVideos(keyword, { region, days });
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
  const clean = all.filter(
    (v) =>
      passesNoiseFilter(v.views, v.creatorFollowers) &&
      (v.views ?? 0) >= (opts.minViews ?? 0) &&
      (!v.publishedAt || new Date(v.publishedAt).getTime() >= since) &&
      !isExcluded(v.caption, exclusions),
  );
  // AI relevance check before any paid baseline lookups, so off-topic creators cost nothing.
  const relevance = opts.product ? await rateRelevance(opts.product, clean) : null;
  const kept = relevance ? clean.filter((_, i) => relevance[i] > 0) : clean;
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
    .sort((a, b) => bestScore(b) - bestScore(a));

  return { videos, hidden: all.length - clean.length, offTopic: clean.length - kept.length, errors };
}

/** Single-keyword search used by the test page. */
export function searchKeyword(keyword: string, platforms?: Platform[]) {
  return searchKeywords([{ text: keyword, region: "th" }], platforms);
}
