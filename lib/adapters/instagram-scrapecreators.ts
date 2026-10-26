import "server-only";
import { fixturesEnabled } from "@/lib/env";
import { logApiCall } from "@/lib/usage";
import { readFixture } from "./fixtures";
import { dropPinned } from "./pinned";
import { DEFAULT_WINDOW, type NormalizedCreator, type NormalizedVideo, type PlatformAdapter, type SearchWindow } from "./types";

// Instagram only offers week / month / year; search.ts trims anything older than the window afterwards.
const IG_WINDOW: Record<SearchWindow, string> = { 7: "last-week", 30: "last-month", 90: "last-year" };

// ScrapeCreators Instagram, checked 2026-10-25: 1 credit per call. Reels search is Google-indexed
// (best-effort, 10 per page) and returns no follower counts, so Reels are scored on usual views only.
// Videos are keyed by shortcode, which is the same in search results and profile reels.
const BASE = "https://api.scrapecreators.com";

type SearchReel = {
  shortcode: string;
  url?: string;
  caption?: string | null;
  thumbnail_src?: string;
  display_url?: string;
  video_view_count?: number | null;
  video_duration?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  taken_at?: string | null;
  owner?: { username?: string; full_name?: string };
};

type ProfileReel = {
  code: string;
  url?: string;
  created_at?: string;
  caption?: { text?: string | null } | null;
  play_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  display_uri?: string;
  user?: { username?: string; full_name?: string };
};

async function call<T>(endpoint: string, params: Record<string, string>): Promise<T | null> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) throw new Error("SCRAPECREATORS_API_KEY is not set");
  const res = await fetch(`${BASE}${endpoint}?${new URLSearchParams(params)}`, {
    headers: { "x-api-key": key },
    cache: "no-store",
  });
  // Reels search answers 404 when Google has no reels for the phrase (common for Thai keywords): no results, not an error.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ScrapeCreators ${endpoint} failed: ${res.status}`);
  await logApiCall("scrapecreators", endpoint);
  return (await res.json()) as T;
}

function fromSearch(r: SearchReel): NormalizedVideo {
  return {
    platform: "instagram",
    platformVideoId: r.shortcode,
    url: r.url ?? `https://www.instagram.com/reel/${r.shortcode}/`,
    thumbnailUrl: r.thumbnail_src ?? r.display_url ?? null,
    caption: r.caption ?? "",
    creatorHandle: r.owner?.username ?? "",
    creatorName: r.owner?.full_name || null,
    creatorFollowers: null,
    views: r.video_view_count ?? null,
    likes: r.like_count ?? null,
    comments: r.comment_count ?? null,
    shares: null,
    saves: null,
    durationSeconds: r.video_duration ? Math.round(r.video_duration) : null,
    publishedAt: r.taken_at ?? null,
    country: null,
    hasShop: false,
    sound: null,
  };
}

function fromProfile(r: ProfileReel): NormalizedVideo {
  return {
    platform: "instagram",
    platformVideoId: r.code,
    url: r.url ?? `https://www.instagram.com/reel/${r.code}/`,
    thumbnailUrl: r.display_uri ?? null,
    caption: r.caption?.text ?? "",
    creatorHandle: r.user?.username ?? "",
    creatorName: r.user?.full_name || null,
    creatorFollowers: null,
    views: r.play_count ?? null,
    likes: r.like_count ?? null,
    comments: r.comment_count ?? null,
    shares: null,
    saves: null,
    durationSeconds: null,
    publishedAt: r.created_at ?? null,
    country: null,
    hasShop: false,
    sound: null,
  };
}

export const instagramAdapter: PlatformAdapter = {
  platform: "instagram",

  async searchVideos(keyword, opts) {
    // No region option: the keyword's language decides whose Reels come back.
    type Res = { reels?: SearchReel[] };
    const data = fixturesEnabled()
      ? await readFixture<Res>("instagram-search")
      : await call<Res>("/v2/instagram/reels/search", { query: keyword, date_posted: IG_WINDOW[opts?.days ?? DEFAULT_WINDOW] });
    return (data?.reels ?? []).filter((r) => r.shortcode).map(fromSearch);
  },

  async getCreator(handle) {
    // Not needed for search or baselines; avoids a paid profile call.
    return { platform: "instagram", handle, displayName: null, avatarUrl: null, followers: null } satisfies NormalizedCreator;
  },

  async getCreatorVideos(handle) {
    // One page (~12 reels, 1 credit) is the baseline.
    type Res = { items?: ProfileReel[] };
    const data = fixturesEnabled()
      ? await readFixture<Res>(`instagram-reels-${handle}`)
      : await call<Res>("/v1/instagram/user/reels", { handle, trim: "true" });
    return dropPinned((data?.items ?? []).filter((r) => r.code).map(fromProfile));
  },
};
