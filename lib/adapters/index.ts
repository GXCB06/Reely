import "server-only";
import { tiktokAdapter } from "./tiktok-scrapecreators";
import type { Platform, PlatformAdapter } from "./types";
import { youtubeAdapter } from "./youtube";

// Instagram arrives on Day 5. Swapping a vendor = replacing one entry here.
export const adapters: Partial<Record<Platform, PlatformAdapter>> = {
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
};

export type { NormalizedCreator, NormalizedVideo, Platform, PlatformAdapter } from "./types";
