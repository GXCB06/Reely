import "server-only";
import { fixturesEnabled } from "@/lib/env";
import { logApiCall } from "@/lib/usage";
import { readFixture } from "./fixtures";
import type { NormalizedCreator, NormalizedVideo, PlatformAdapter } from "./types";

// ScrapeCreators facts verified on Day 0 (docs/DAY0.md): 1 credit per call, 30 results per search,
// 10 videos per profile page. Always trim responses and exclude pinned posts.
const BASE = "https://api.scrapecreators.com";

type Media = { url_list?: string[] };
type Aweme = {
  aweme_id: string;
  desc?: string;
  url?: string;
  create_time?: number;
  statistics?: {
    play_count?: number;
    digg_count?: number;
    comment_count?: number;
    share_count?: number;
    collect_count?: number;
  };
  video?: { cover?: Media; origin_cover?: Media; dynamic_cover?: Media; duration?: number };
  author?: { unique_id?: string; nickname?: string; follower_count?: number };
};

async function call<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) throw new Error("SCRAPECREATORS_API_KEY is not set");
  const res = await fetch(`${BASE}${endpoint}?${new URLSearchParams(params)}`, {
    headers: { "x-api-key": key },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ScrapeCreators ${endpoint} failed: ${res.status}`);
  await logApiCall("scrapecreators", endpoint);
  return (await res.json()) as T;
}

/** Prefers a JPEG/WebP cover: some TikTok covers are HEIC, which Chrome can't display. */
function pickThumbnail(video: Aweme["video"]): string | null {
  const urls = [video?.cover, video?.origin_cover, video?.dynamic_cover].flatMap((m) => m?.url_list ?? []);
  return urls.find((u) => !/\.heic(\?|~|$)/i.test(u)) ?? urls[0] ?? null;
}

function toVideo(a: Aweme): NormalizedVideo {
  const handle = a.author?.unique_id ?? "";
  const s = a.statistics ?? {};
  // Profile feeds report duration in ms; search results in seconds.
  const rawDuration = a.video?.duration ?? null;
  return {
    platform: "tiktok",
    platformVideoId: a.aweme_id,
    url: a.url ?? `https://www.tiktok.com/@${handle}/video/${a.aweme_id}`,
    thumbnailUrl: pickThumbnail(a.video),
    caption: a.desc ?? "",
    creatorHandle: handle,
    creatorName: a.author?.nickname ?? null,
    creatorFollowers: a.author?.follower_count ?? null,
    views: s.play_count ?? null,
    likes: s.digg_count ?? null,
    comments: s.comment_count ?? null,
    shares: s.share_count ?? null,
    saves: s.collect_count ?? null,
    durationSeconds: rawDuration === null ? null : rawDuration > 1000 ? Math.round(rawDuration / 1000) : rawDuration,
    publishedAt: a.create_time ? new Date(a.create_time * 1000).toISOString() : null,
  };
}

export const tiktokAdapter: PlatformAdapter = {
  platform: "tiktok",

  async searchVideos(keyword, opts) {
    type Res = { search_item_list?: (Aweme & { aweme_info?: Aweme })[] };
    const data = fixturesEnabled()
      ? await readFixture<Res>("tiktok-search")
      : await call<Res>("/v1/tiktok/search/keyword", {
          query: keyword,
          date_posted: opts?.recent ? "this-week" : "last-6-months",
          trim: "true",
          // Sets where the search runs from (not a hard filter): Thai results from TH, worldwide from US.
          region: opts?.region === "global" ? "US" : "TH",
        });
    return (data?.search_item_list ?? []).map((item) => toVideo(item.aweme_info ?? item));
  },

  async getCreator(handle) {
    type Res = {
      user?: { uniqueId?: string; nickname?: string; avatarThumb?: string };
      stats?: { followerCount?: number };
    };
    const data = fixturesEnabled()
      ? await readFixture<Res>(`tiktok-profile-${handle}`)
      : await call<Res>("/v1/tiktok/profile", { handle });
    return {
      platform: "tiktok",
      handle: data?.user?.uniqueId ?? handle,
      displayName: data?.user?.nickname ?? null,
      avatarUrl: data?.user?.avatarThumb ?? null,
      followers: data?.stats?.followerCount ?? null,
    } satisfies NormalizedCreator;
  },

  async getCreatorVideos(handle) {
    type Res = { aweme_list?: Aweme[]; max_cursor?: number | string; has_more?: number | boolean };
    const videos: NormalizedVideo[] = [];
    let cursor: string | undefined;
    // Two pages of 10 = a 20-video baseline (2 credits).
    for (let page = 1; page <= 2; page++) {
      const data = fixturesEnabled()
        ? await readFixture<Res>(`tiktok-videos-${handle}-${page}`)
        : await call<Res>("/v3/tiktok/profile/videos", {
            handle,
            trim: "true",
            include_pinned: "false",
            region: "TH",
            ...(cursor ? { max_cursor: cursor } : {}),
          });
      videos.push(...(data?.aweme_list ?? []).map(toVideo));
      if (!data?.has_more || !data.max_cursor) break;
      cursor = String(data.max_cursor);
    }
    const seen = new Set<string>();
    return videos.filter((v) => !seen.has(v.platformVideoId) && seen.add(v.platformVideoId));
  },

  async getTranscript(videoUrl) {
    type Res = { transcript?: string | null };
    const data = fixturesEnabled()
      ? await readFixture<Res>("tiktok-transcript")
      : await call<Res>("/v1/tiktok/video/transcript", { url: videoUrl });
    return data?.transcript ?? null;
  },
};
