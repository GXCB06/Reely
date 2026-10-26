import "server-only";
import type { NormalizedVideo, Platform } from "@/lib/adapters/types";
import { createAdminClient } from "@/lib/supabase/admin";

// Shared 24-hour cache (CLAUDE.md cost rule 4). All functions are no-ops until Supabase is configured.
const TTL_MS = 24 * 60 * 60 * 1000;

export type CachedCreator = { followers: number | null; usualViews: number | null; sampleSize: number | null };

export async function getFreshCreator(platform: Platform, handle: string): Promise<CachedCreator | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("creators")
    .select("followers, usual_views, sample_size, fetched_at")
    .eq("platform", platform)
    .eq("handle", handle)
    .maybeSingle();
  if (!data || Date.now() - new Date(data.fetched_at).getTime() > TTL_MS) return null;
  return { followers: data.followers, usualViews: data.usual_views, sampleSize: data.sample_size };
}

export async function saveCreator(
  platform: Platform,
  handle: string,
  values: { followers: number | null; usualViews: number | null; sampleSize: number; displayName?: string | null },
) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("creators").upsert(
    {
      platform,
      handle,
      display_name: values.displayName ?? null,
      followers: values.followers,
      usual_views: values.usualViews === null ? null : Math.round(values.usualViews),
      sample_size: values.sampleSize,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "platform,handle" },
  );
}

/** Upserts videos into the shared cache and returns their database ids keyed by platform video id. */
export async function saveVideos(videos: NormalizedVideo[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  const admin = createAdminClient();
  if (!admin || !videos.length) return ids;

  // Covers already copied to our storage keep that URL (vendor links expire).
  const stored = new Map<string, string>();
  for (const platform of [...new Set(videos.map((v) => v.platform))]) {
    const { data: rows } = await admin
      .from("videos")
      .select("platform, platform_video_id, thumbnail_url")
      .eq("platform", platform)
      .in("platform_video_id", videos.filter((v) => v.platform === platform).map((v) => v.platformVideoId))
      .like("thumbnail_url", "%/storage/v1/object/public/thumbs/%");
    rows?.forEach((r) => stored.set(`${r.platform}:${r.platform_video_id}`, r.thumbnail_url as string));
  }
  // Covers are copied afterwards (persistThumbnails, run with after()) so a search never waits on them.
  const thumbOf = (v: NormalizedVideo) => stored.get(`${v.platform}:${v.platformVideoId}`) ?? v.thumbnailUrl;

  const { data } = await admin
    .from("videos")
    .upsert(
      videos.map((v) => ({
        platform: v.platform,
        platform_video_id: v.platformVideoId,
        url: v.url,
        thumbnail_url: thumbOf(v),
        caption: v.caption,
        creator_handle: v.creatorHandle,
        creator_followers: v.creatorFollowers,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        shares: v.shares,
        saves: v.saves,
        duration_seconds: v.durationSeconds,
        published_at: v.publishedAt,
        country: v.country,
        has_shop: v.hasShop,
        sound_id: v.sound?.id ?? null,
        sound_title: v.sound?.title ?? null,
        sound_author: v.sound?.author ?? null,
        sound_original: v.sound?.original ?? null,
        fetched_at: new Date().toISOString(),
      })),
      { onConflict: "platform,platform_video_id" },
    )
    .select("id, platform, platform_video_id");
  data?.forEach((row) => ids.set(`${row.platform}:${row.platform_video_id}`, row.id));
  return ids;
}
