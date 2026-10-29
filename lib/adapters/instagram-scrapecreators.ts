import "server-only";
import { fixturesEnabled } from "@/lib/env";
import { logApiCall } from "@/lib/usage";
import { readFixture } from "./fixtures";
import { dropPinned } from "./pinned";
import { popularQueries } from "./popular-queries";
import { DEFAULT_WINDOW, type NormalizedCreator, type NormalizedVideo, type PlatformAdapter, type SearchWindow } from "./types";

// Instagram only offers week / month / year; search.ts trims anything older than the window afterwards.
const IG_WINDOW: Record<SearchWindow, string> = { 7: "last-week", 30: "last-month", 90: "last-year" };

/**
 * Instagram has far less searchable data than TikTok (its "popular" search is mostly older posts; a 6-month
 * window returned nothing in a test), so Reels always look back at least a year. Cards show the date.
 */
export const INSTAGRAM_MIN_DAYS = 365;
const INSTAGRAM_EPOCH_MS = 1314220021721;

/** An Instagram media id holds its creation time (ms since Instagram's epoch, shifted left 23 bits). */
export function instagramIdDate(id: string): string | null {
  const digits = id.replace(/\D/g, "");
  if (!digits) return null;
  const ms = Number(BigInt(digits) >> BigInt(23)) + INSTAGRAM_EPOCH_MS;
  return ms > INSTAGRAM_EPOCH_MS && ms < Date.now() + 864e5 ? new Date(ms).toISOString() : null;
}

/** Instagram "popular" (curated top posts for a topic; English queries only, Thai returns nothing). */
type PopularPost = {
  id: string;
  shortcode: string;
  url?: string;
  type?: string;
  caption?: string | null;
  display_url?: string;
  play_count?: string | number | null;
  owner?: { username?: string };
};

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

function fromPopular(p: PopularPost): NormalizedVideo {
  const views = p.play_count === null || p.play_count === undefined ? null : Number(p.play_count);
  return {
    platform: "instagram",
    platformVideoId: p.shortcode,
    url: p.url ?? `https://www.instagram.com/reel/${p.shortcode}/`,
    thumbnailUrl: p.display_url ?? null,
    caption: p.caption ?? "",
    creatorHandle: p.owner?.username ?? "",
    creatorName: null,
    creatorFollowers: null,
    views: Number.isFinite(views) ? views : null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    durationSeconds: null,
    publishedAt: instagramIdDate(p.id),
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
    // "Popular" first: Instagram's own top reels for the topic (test 2026-10-26: median 44.6K views vs
    // ~9K from reels search). It only understands English, so search.ts passes the English keyword.
    // Falls back to the Google-indexed reels search when popular has nothing (1 more credit).
    // Popular only knows some phrasings (checked 2026-10-27: "accounting tips" has 12 reels, "calorie counting" none)
    // and an empty answer is free, so a couple of rewordings are tried before the weaker reels search.
    type PopRes = { posts?: PopularPost[] };
    for (const query of popularQueries(keyword)) {
      const popular = fixturesEnabled()
        ? await readFixture<PopRes>("instagram-popular")
        : await call<PopRes>("/v1/instagram/search/popular", { query });
      const reels = (popular?.posts ?? []).filter((p) => p.shortcode && (!p.type || p.type === "reel")).map(fromPopular);
      if (reels.length) return reels;
    }
    type Res = { reels?: SearchReel[] };
    const days = Math.max(opts?.days ?? DEFAULT_WINDOW, INSTAGRAM_MIN_DAYS) as SearchWindow;
    const data = fixturesEnabled()
      ? await readFixture<Res>("instagram-search")
      : await call<Res>("/v2/instagram/reels/search", { query: keyword, date_posted: IG_WINDOW[days] ?? "last-year" });
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

/**
 * Up to `pages` pages (~12 reels each, newest first) of a creator's reels: 1 credit per page found, and a profile that
 * doesn't exist costs nothing. One page misses older hits: AccOS Pro's 1.4M-play reel was 3 weeks and ~25 reels back.
 */
export type InstagramAccount = { handle: string; name: string };

/**
 * Instagram's own account search (1 credit, ~15 s): unlike popular and reels search it understands Thai, e.g.
 * "AI การตลาด" → @contentshifu, @everydaymarketing.co (checked 2026-10-28). It returns accounts only, no posts.
 */
export async function instagramSearchAccounts(query: string): Promise<InstagramAccount[]> {
  if (fixturesEnabled()) return [];
  type Res = { users?: { username?: string; full_name?: string | null }[] };
  const data = await call<Res>("/v1/instagram/search", { query });
  return (data?.users ?? []).filter((u) => u.username).map((u) => ({ handle: u.username!, name: u.full_name ?? "" }));
}

export async function instagramReels(handle: string, pages = 1): Promise<NormalizedVideo[]> {
  if (fixturesEnabled()) return instagramAdapter.getCreatorVideos(handle);
  type Res = { items?: ProfileReel[]; max_id?: string | null };
  const items: ProfileReel[] = [];
  let maxId: string | null | undefined;
  for (let page = 0; page < pages; page++) {
    const data = await call<Res>("/v1/instagram/user/reels", { handle, trim: "true", ...(maxId ? { max_id: maxId } : {}) });
    items.push(...(data?.items ?? []));
    maxId = data?.max_id;
    if (!maxId) break;
  }
  return dropPinned(items.filter((r) => r.code).map(fromProfile));
}

/** /v1/instagram/post (checked live 2026-10-27): plays match the profile feed's play_count; no follower count. */
type PostMedia = {
  shortcode?: string;
  thumbnail_src?: string;
  display_url?: string;
  video_play_count?: number | null;
  video_view_count?: number | null;
  video_duration?: number | null;
  is_video?: boolean;
  created_at?: string | null;
  taken_at_timestamp?: number | null;
  comment_count?: number | null;
  owner?: { username?: string; full_name?: string };
  edge_media_to_caption?: { edges?: { node?: { text?: string } }[] };
  edge_media_preview_like?: { count?: number | null };
};

/** One reel from its link (1 credit), for "paste a Reel link". Null when the post is not a video. */
export async function instagramPost(url: string): Promise<NormalizedVideo | null> {
  type Res = { data?: { xdt_shortcode_media?: PostMedia | null } };
  const data = fixturesEnabled() ? await readFixture<Res>("instagram-post") : await call<Res>("/v1/instagram/post", { url });
  const m = data?.data?.xdt_shortcode_media;
  if (!m?.shortcode || m.is_video === false) return null;
  return {
    platform: "instagram",
    platformVideoId: m.shortcode,
    url: `https://www.instagram.com/reel/${m.shortcode}/`,
    thumbnailUrl: m.thumbnail_src ?? m.display_url ?? null,
    caption: m.edge_media_to_caption?.edges?.[0]?.node?.text ?? "",
    creatorHandle: m.owner?.username ?? "",
    creatorName: m.owner?.full_name || null,
    creatorFollowers: null,
    views: m.video_play_count ?? m.video_view_count ?? null,
    likes: m.edge_media_preview_like?.count ?? null,
    comments: m.comment_count ?? null,
    shares: null,
    saves: null,
    durationSeconds: m.video_duration ? Math.round(m.video_duration) : null,
    publishedAt: m.created_at ?? (m.taken_at_timestamp ? new Date(m.taken_at_timestamp * 1000).toISOString() : null),
    country: null,
    hasShop: false,
    sound: null,
  };
}

/** A fresh cover link for one reel (1 credit). Only for repairing a cover that expired before it was copied. */
export async function instagramPostCover(url: string): Promise<string | null> {
  if (fixturesEnabled()) return null;
  type Res = { data?: { xdt_shortcode_media?: { thumbnail_src?: string; display_url?: string } } };
  const data = await call<Res>("/v1/instagram/post", { url });
  const media = data?.data?.xdt_shortcode_media;
  return media?.thumbnail_src ?? media?.display_url ?? null;
}
