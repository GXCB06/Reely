import "server-only";
import { adapters } from "@/lib/adapters";
import type { Platform } from "@/lib/adapters/types";
import { saveCreator, saveVideos } from "@/lib/cache";
import { type VideoRow, videoFromRow } from "@/lib/db-mappers";
import { BREAKOUT_AT, labelFor, reachScore, usualScore, usualViewsExcluding } from "@/lib/scoring";
import type { ScoredVideo } from "@/lib/search";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TTL_MS = 24 * 60 * 60 * 1000;
const RECENT_LIMIT = 30;

export type AccountStats = {
  platform: Platform;
  handle: string;
  displayName: string | null;
  followers: number | null;
  usualViews: number | null;
  sampleSize: number;
  breakouts30d: number;
  /** Posts per month for the last 4 months, oldest first. */
  postsPerMonth: { month: string; count: number }[];
  fetchedAt: string | null;
  videos: ScoredVideo[];
};

/**
 * Refreshes one account's recent posts if the shared cache is older than 24 hours (cost rule 5).
 * TikTok: 2 calls (2 pages of 10). YouTube: free. Shared by every user who tracks the account.
 */
export async function refreshIfStale(platform: Platform, handle: string): Promise<{ refreshed: boolean; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { refreshed: false };
  const { data: creator } = await admin
    .from("creators")
    .select("fetched_at, sample_size")
    .eq("platform", platform)
    .eq("handle", handle)
    .maybeSingle();
  const fresh = creator && (creator.sample_size ?? 0) > 0 && Date.now() - new Date(creator.fetched_at).getTime() < TTL_MS;
  if (fresh) return { refreshed: false };

  try {
    const recent = await adapters[platform]!.getCreatorVideos(handle);
    if (!recent.length) return { refreshed: false, error: "empty" };
    await saveVideos(recent);
    await saveCreator(platform, handle, {
      followers: recent[0].creatorFollowers,
      usualViews: usualViewsExcluding(recent.map((v) => ({ id: v.platformVideoId, views: v.views }))),
      sampleSize: recent.length,
      displayName: recent[0].creatorName,
    });
    return { refreshed: true };
  } catch (e) {
    return { refreshed: false, error: (e as Error).message };
  }
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Builds the row data for one tracked account from the shared cache (no external calls). */
export async function loadAccount(platform: Platform, handle: string, now = Date.now()): Promise<AccountStats> {
  const supabase = await createClient();
  const [{ data: creator }, { data: rows }] = await Promise.all([
    supabase
      .from("creators")
      .select("display_name, followers, usual_views, sample_size, fetched_at")
      .eq("platform", platform)
      .eq("handle", handle)
      .maybeSingle(),
    supabase
      .from("videos")
      .select("*")
      .eq("platform", platform)
      .eq("creator_handle", handle)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(RECENT_LIMIT),
  ]);

  const list = (rows ?? []) as VideoRow[];
  const posts = list.map((v) => ({ id: String(v.id), views: v.views }));
  const followers = (creator?.followers as number | null) ?? list[0]?.creator_followers ?? null;

  const videos = list
    .map((v) => {
      const usualViews = usualViewsExcluding(posts, String(v.id));
      const usual = usualScore(v.views, usualViews);
      const reach = reachScore(v.views, followers);
      return videoFromRow(v, { usual, reach, usualViews, label: labelFor(usual, reach, { views: v.views, followers }) });
    })
    // Biggest outliers first.
    .sort((a, b) => (b.usual ?? 0) - (a.usual ?? 0));

  const month = new Date(now);
  const months = Array.from({ length: 4 }, (_, i) => monthKey(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - (3 - i), 1))));
  const counts = new Map(months.map((m) => [m, 0]));
  for (const v of list) {
    if (!v.published_at) continue;
    const k = monthKey(new Date(v.published_at));
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }

  return {
    platform,
    handle,
    displayName: (creator?.display_name as string | null) ?? null,
    followers,
    usualViews: (creator?.usual_views as number | null) ?? null,
    sampleSize: list.length,
    breakouts30d: videos.filter(
      (v) => (v.usual ?? 0) >= BREAKOUT_AT && v.publishedAt && now - new Date(v.publishedAt).getTime() <= 30 * 864e5,
    ).length,
    postsPerMonth: months.map((m) => ({ month: m, count: counts.get(m)! })),
    fetchedAt: (creator?.fetched_at as string | null) ?? null,
    videos,
  };
}
