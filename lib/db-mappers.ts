import type { NormalizedVideo, Platform } from "@/lib/adapters/types";
import type { OutlierLabel } from "@/lib/scoring";
import type { ScoredVideo } from "@/lib/search";

/** Row shape of public.videos as returned by Supabase. */
export type VideoRow = {
  id: number;
  platform: Platform;
  platform_video_id: string;
  url: string;
  thumbnail_url: string | null;
  caption: string;
  creator_handle: string;
  creator_followers: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  duration_seconds: number | null;
  published_at: string | null;
  country: string | null;
  has_shop: boolean | null;
  sound_id: string | null;
  sound_title: string | null;
  sound_author: string | null;
  sound_original: boolean | null;
};

export type ResultRow = {
  keyword: string | null;
  reach_score: number | null;
  usual_score: number | null;
  usual_views: number | null;
  label: OutlierLabel | null;
  copyable?: number | null;
  videos: VideoRow | null;
};

/** A stored video as the adapters return it (no scores). */
export function normalizedFromRow(v: VideoRow): NormalizedVideo {
  return {
    platform: v.platform,
    platformVideoId: v.platform_video_id,
    url: v.url,
    thumbnailUrl: v.thumbnail_url,
    caption: v.caption,
    creatorHandle: v.creator_handle,
    creatorName: null,
    creatorFollowers: v.creator_followers,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    shares: v.shares,
    saves: v.saves,
    durationSeconds: v.duration_seconds,
    publishedAt: v.published_at,
    country: v.country ?? null,
    hasShop: Boolean(v.has_shop),
    sound: v.sound_id
      ? { id: v.sound_id, title: v.sound_title ?? "", author: v.sound_author, original: Boolean(v.sound_original) }
      : null,
  };
}

export function videoFromRow(
  v: VideoRow,
  scores: { reach: number | null; usual: number | null; usualViews: number | null; label: OutlierLabel; keyword?: string },
): ScoredVideo {
  return {
    ...normalizedFromRow(v),
    reach: scores.reach,
    usual: scores.usual,
    usualViews: scores.usualViews,
    label: scores.label,
    keyword: scores.keyword ?? "",
    dbId: v.id,
  };
}

export function videoFromResultRow(r: ResultRow): ScoredVideo | null {
  if (!r.videos) return null;
  const video = videoFromRow(r.videos, {
    reach: r.reach_score === null ? null : Number(r.reach_score),
    usual: r.usual_score === null ? null : Number(r.usual_score),
    usualViews: r.usual_views,
    label: r.label ?? "normal",
    keyword: r.keyword ?? "",
  });
  return { ...video, copyable: r.copyable ?? null };
}
