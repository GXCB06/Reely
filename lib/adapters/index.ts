import "server-only";
import { instagramAdapter } from "./instagram-scrapecreators";
import { tiktokAdapter } from "./tiktok-scrapecreators";
import type { Platform, PlatformAdapter } from "./types";
import { youtubeAdapter } from "./youtube";

// Swapping a vendor = replacing one entry here.
export const adapters: Record<Platform, PlatformAdapter> = {
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
  instagram: instagramAdapter,
};

export type { NormalizedCreator, NormalizedVideo, Platform, PlatformAdapter, SearchRegion } from "./types";
