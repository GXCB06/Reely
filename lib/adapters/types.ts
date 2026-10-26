export type Platform = "youtube" | "tiktok" | "instagram";

/** Where a keyword search should look: Thai audience or worldwide (mostly English). */
export type SearchRegion = "th" | "global";

/** How far back a search looks. Trends move fast, so the default is 90 days, never a year or more. */
export type SearchWindow = 7 | 30 | 90;
export const DEFAULT_WINDOW: SearchWindow = 90;

export type SearchOptions = { region?: SearchRegion; days?: SearchWindow };

/** The sound a video uses (TikTok). The same sound across many videos usually means the same trend. */
export type VideoSound = { id: string; title: string; author: string | null; original: boolean };

/** One short video in the same shape for every platform. */
export interface NormalizedVideo {
  platform: Platform;
  platformVideoId: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string;
  creatorHandle: string;
  creatorName: string | null;
  creatorFollowers: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  /** ISO country code of the post (TikTok) or channel (YouTube); null when unknown. */
  country: string | null;
  /** Linked to a TikTok Shop product (useful for affiliates). */
  hasShop: boolean;
  sound: VideoSound | null;
}

export interface NormalizedCreator {
  platform: Platform;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  followers: number | null;
}

/** The app talks only to adapters, never to vendor APIs directly (CLAUDE.md). */
export interface PlatformAdapter {
  platform: Platform;
  /** One page of results for a keyword. */
  searchVideos(keyword: string, opts?: SearchOptions): Promise<NormalizedVideo[]>;
  getCreator(handle: string): Promise<NormalizedCreator>;
  /** ~20 most recent posts, pinned posts excluded. */
  getCreatorVideos(handle: string): Promise<NormalizedVideo[]>;
  getTranscript?(videoUrl: string): Promise<string | null>;
}
