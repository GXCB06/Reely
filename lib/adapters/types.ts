export type Platform = "youtube" | "tiktok" | "instagram";

/** Where a keyword search should look: Thai audience or worldwide (mostly English). */
export type SearchRegion = "th" | "global";

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
  searchVideos(keyword: string, opts?: { region?: SearchRegion }): Promise<NormalizedVideo[]>;
  getCreator(handle: string): Promise<NormalizedCreator>;
  /** ~20 most recent posts, pinned posts excluded. */
  getCreatorVideos(handle: string): Promise<NormalizedVideo[]>;
  getTranscript?(videoUrl: string): Promise<string | null>;
}
