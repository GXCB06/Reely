import "server-only";
import { fixturesEnabled } from "@/lib/env";
import { logApiCall } from "@/lib/usage";
import { readFixture } from "./fixtures";
import { DEFAULT_WINDOW, type NormalizedCreator, type NormalizedVideo, type PlatformAdapter, type SearchWindow } from "./types";

// ScrapeCreators facts verified on Day 0 (docs/DAY0.md): 1 credit per call, 30 results per search,
// 10 videos per profile page. Profile feeds are trimmed and exclude pinned posts. Keyword search is NOT
// trimmed: the trimmed response drops the sound, which the format explorer needs (same credit cost).
const DATE_POSTED: Record<SearchWindow, string> = { 7: "this-week", 30: "this-month", 90: "last-3-months" };
const BASE = "https://api.scrapecreators.com";

type Media = { url_list?: string[] };
type Aweme = {
  aweme_id: string;
  /** Top search uses `id` instead of `aweme_id`, and also returns photo carousels. */
  id?: string;
  content_type?: string;
  desc_language?: string;
  desc?: string;
  url?: string;
  /** Unix seconds; the Top search returns an ISO string instead. */
  create_time?: number | string;
  statistics?: {
    play_count?: number;
    digg_count?: number;
    comment_count?: number;
    share_count?: number;
    collect_count?: number;
  };
  video?: { cover?: Media; origin_cover?: Media; dynamic_cover?: Media; duration?: number };
  author?: { unique_id?: string; nickname?: string; follower_count?: number };
  region?: string;
  shop_product_url?: string | null;
  music?: { id_str?: string; id?: number | string; title?: string; author?: string; is_original_sound?: boolean } | null;
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

function publishedAt(t: Aweme["create_time"]): string | null {
  if (t === undefined || t === null || t === "") return null;
  const d = typeof t === "number" || /^\d+$/.test(t) ? new Date(Number(t) * 1000) : new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function soundOf(m: Aweme["music"]): NormalizedVideo["sound"] {
  const id = m?.id_str ?? (m?.id !== undefined ? String(m.id) : null);
  if (!m || !id || id === "0") return null;
  return { id, title: m.title ?? "", author: m.author ?? null, original: Boolean(m.is_original_sound) };
}

function toVideo(a: Aweme): NormalizedVideo {
  const handle = a.author?.unique_id ?? "";
  const s = a.statistics ?? {};
  // Profile feeds report duration in ms; search results in seconds.
  const rawDuration = a.video?.duration ?? null;
  return {
    platform: "tiktok",
    platformVideoId: a.aweme_id ?? a.id ?? "",
    url: a.url ?? `https://www.tiktok.com/@${handle}/video/${a.aweme_id ?? a.id}`,
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
    publishedAt: publishedAt(a.create_time),
    country: a.region && /^[A-Z]{2}$/.test(a.region) ? a.region : null,
    hasShop: Boolean(a.shop_product_url),
    sound: soundOf(a.music),
    language: a.desc_language || null,
  };
}

export const tiktokAdapter: PlatformAdapter = {
  platform: "tiktok",

  async searchVideos(keyword, opts) {
    const when = DATE_POSTED[opts?.days ?? DEFAULT_WINDOW];
    // Sets where the search runs from (not a hard filter): Thai results from TH, worldwide from US.
    const region = opts?.region === "global" ? "US" : "TH";
    if (opts?.order === "top") {
      type TopRes = { items?: Aweme[] };
      const data = fixturesEnabled()
        ? await readFixture<TopRes>("tiktok-search-top")
        : await call<TopRes>("/v1/tiktok/search/top", { query: keyword, publish_time: when, region });
      return (data?.items ?? [])
        .filter((a) => (a.aweme_id ?? a.id) && (!a.content_type || a.content_type === "video"))
        .map(toVideo);
    }
    type Res = { search_item_list?: (Aweme & { aweme_info?: Aweme })[] };
    const data = fixturesEnabled()
      ? await readFixture<Res>("tiktok-search")
      : await call<Res>("/v1/tiktok/search/keyword", { query: keyword, date_posted: when, sort_by: "most-liked", region });
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

/** Videos that use one sound (1 credit per page of ~12). Powers "who else made this kind of clip". */
export async function tiktokSoundVideos(soundId: string): Promise<NormalizedVideo[]> {
  type Res = { aweme_list?: Aweme[] };
  const data = fixturesEnabled()
    ? await readFixture<Res>("tiktok-song-videos")
    : await call<Res>("/v1/tiktok/song/videos", { clipId: soundId });
  return (data?.aweme_list ?? []).map(toVideo);
}
