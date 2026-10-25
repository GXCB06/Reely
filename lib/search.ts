import "server-only";
import { adapters } from "@/lib/adapters";
import type { NormalizedVideo, Platform } from "@/lib/adapters/types";
import { getFreshCreator, saveCreator, saveVideos } from "@/lib/cache";
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

export type ScoredVideo = NormalizedVideo & {
  reach: number | null;
  usual: number | null;
  usualViews: number | null;
  label: OutlierLabel;
};

export type SearchResult = { videos: ScoredVideo[]; hidden: number; errors: string[] };

async function creatorBaseline(platform: Platform, handle: string) {
  const cached = await getFreshCreator(platform, handle);
  if (cached?.usualViews) return { usualViews: cached.usualViews, recent: null };

  const recent = await adapters[platform]!.getCreatorVideos(handle);
  const posts = recent.map((v) => ({ id: v.platformVideoId, views: v.views }));
  const usualViews = usualViewsExcluding(posts);
  if (recent.length) {
    await saveCreator(platform, handle, {
      followers: recent[0].creatorFollowers,
      usualViews,
      sampleSize: recent.length,
      displayName: recent[0].creatorName,
    });
  }
  return { usualViews, recent: posts };
}

/** Searches one keyword on each platform, filters noise, adds both outlier scores and ranks the results. */
export async function searchKeyword(keyword: string, platforms: Platform[] = ["tiktok", "youtube"]): Promise<SearchResult> {
  const errors: string[] = [];
  const found = await Promise.all(
    platforms.map(async (p) => {
      try {
        return await adapters[p]!.searchVideos(keyword);
      } catch (e) {
        errors.push(`${p}: ${(e as Error).message}`);
        return [];
      }
    }),
  );

  const all = found.flat();
  const kept = all.filter((v) => passesNoiseFilter(v.views, v.creatorFollowers));
  await saveVideos(kept);

  // Usual-views baselines for the top creators (by reach) on each platform.
  const baselines = new Map<string, { usualViews: number | null; recent: { id: string; views: number | null }[] | null }>();
  for (const p of platforms) {
    const top = [
      ...new Set(
        kept
          .filter((v) => v.platform === p)
          .sort((a, b) => (reachScore(b.views, b.creatorFollowers) ?? 0) - (reachScore(a.views, a.creatorFollowers) ?? 0))
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
      const reach = reachScore(v.views, v.creatorFollowers);
      const usual = usualScore(v.views, usualViews);
      return { ...v, reach, usual, usualViews, label: labelFor(usual, reach) };
    })
    .sort((a, b) => (b.usual ?? b.reach ?? 0) - (a.usual ?? a.reach ?? 0));

  return { videos, hidden: all.length - kept.length, errors };
}
