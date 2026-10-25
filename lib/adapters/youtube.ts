import "server-only";
import { fixturesEnabled } from "@/lib/env";
import { logApiCall } from "@/lib/usage";
import { readFixture } from "./fixtures";
import type { NormalizedCreator, NormalizedVideo, PlatformAdapter } from "./types";

// YouTube Data API v3 (official, free): search = 100 quota units, videos/channels/playlistItems = 1 unit.
const BASE = "https://www.googleapis.com/youtube/v3";
const SHORTS_MAX_SECONDS = 180;

type Thumbs = Record<string, { url: string }>;
type VideoItem = {
  id: string;
  snippet: { title: string; description?: string; channelId: string; channelTitle: string; publishedAt: string; thumbnails: Thumbs };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};
type ChannelItem = {
  id: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: Thumbs };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

async function call<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not set");
  const res = await fetch(`${BASE}/${endpoint}?${new URLSearchParams({ ...params, key })}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`YouTube ${endpoint} failed: ${res.status}`);
  await logApiCall("youtube", endpoint);
  return (await res.json()) as T;
}

/** "PT1M5S" → 65 */
export function parseIsoDuration(iso?: string): number | null {
  const m = iso?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

const num = (v?: string) => (v === undefined ? null : Number(v));

/** Creators without a custom @handle are stored by channel id ("UC…"). */
const channelLookup = (handle: string): Record<string, string> => (/^UC[\w-]{22}$/.test(handle) ? { id: handle } : { forHandle: `@${handle}` });

function toVideo(v: VideoItem, channel?: ChannelItem): NormalizedVideo {
  const t = v.snippet.thumbnails;
  return {
    platform: "youtube",
    platformVideoId: v.id,
    url: `https://www.youtube.com/shorts/${v.id}`,
    thumbnailUrl: (t.high ?? t.medium ?? t.default)?.url ?? null,
    caption: v.snippet.title,
    creatorHandle: channel?.snippet?.customUrl?.replace(/^@/, "") ?? v.snippet.channelId,
    creatorName: v.snippet.channelTitle,
    creatorFollowers: channel?.statistics?.hiddenSubscriberCount ? null : num(channel?.statistics?.subscriberCount),
    views: num(v.statistics?.viewCount),
    likes: num(v.statistics?.likeCount),
    comments: num(v.statistics?.commentCount),
    shares: null,
    saves: null,
    durationSeconds: parseIsoDuration(v.contentDetails?.duration),
    publishedAt: v.snippet.publishedAt,
  };
}

async function loadVideosWithChannels(ids: string[]) {
  if (!ids.length) return [];
  const videos = fixturesEnabled()
    ? await readFixture<{ items: VideoItem[] }>("youtube-videos")
    : await call<{ items: VideoItem[] }>("videos", { part: "snippet,statistics,contentDetails", id: ids.join(",") });
  const channelIds = [...new Set((videos?.items ?? []).map((v) => v.snippet.channelId))];
  const channels = fixturesEnabled()
    ? await readFixture<{ items: ChannelItem[] }>("youtube-channels")
    : await call<{ items: ChannelItem[] }>("channels", { part: "snippet,statistics", id: channelIds.join(",") });
  const byId = new Map((channels?.items ?? []).map((c) => [c.id, c]));
  return (videos?.items ?? [])
    .map((v) => toVideo(v, byId.get(v.snippet.channelId)))
    .filter((v) => v.durationSeconds === null || v.durationSeconds <= SHORTS_MAX_SECONDS);
}

export const youtubeAdapter: PlatformAdapter = {
  platform: "youtube",

  async searchVideos(keyword, opts) {
    type Res = { items?: { id: { videoId: string } }[] };
    const sixMonthsAgo = new Date(Date.now() - 182 * 864e5).toISOString();
    const data = fixturesEnabled()
      ? await readFixture<Res>("youtube-search")
      : await call<Res>("search", {
          part: "snippet",
          type: "video",
          videoDuration: "short",
          maxResults: "25",
          publishedAfter: sixMonthsAgo,
          q: keyword,
          ...(opts?.region === "global" ? { relevanceLanguage: "en" } : { regionCode: "TH", relevanceLanguage: "th" }),
        });
    return loadVideosWithChannels((data?.items ?? []).map((i) => i.id.videoId));
  },

  async getCreator(handle) {
    if (fixturesEnabled()) return { platform: "youtube", handle, displayName: null, avatarUrl: null, followers: null };
    const data = await call<{ items?: ChannelItem[] }>("channels", { part: "snippet,statistics", ...channelLookup(handle) });
    const c = data.items?.[0];
    return {
      platform: "youtube",
      handle,
      displayName: c?.snippet?.title ?? null,
      avatarUrl: c?.snippet?.thumbnails?.default?.url ?? null,
      followers: c?.statistics?.hiddenSubscriberCount ? null : num(c?.statistics?.subscriberCount),
    } satisfies NormalizedCreator;
  },

  async getCreatorVideos(handle) {
    if (fixturesEnabled()) return [];
    const ch = await call<{ items?: ChannelItem[] }>("channels", { part: "contentDetails", ...channelLookup(handle) });
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) return [];
    const list = await call<{ items?: { contentDetails: { videoId: string } }[] }>("playlistItems", {
      part: "contentDetails",
      playlistId: uploads,
      maxResults: "50",
    });
    const shorts = await loadVideosWithChannels((list.items ?? []).map((i) => i.contentDetails.videoId));
    return shorts.slice(0, 20);
  },
};
