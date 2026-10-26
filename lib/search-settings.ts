// Search settings shared by the chat (client) and the server. No server imports.
import type { SearchWindow } from "@/lib/adapters/types";

/** What the user chose before searching: how far back, and the fewest views a result may have. */
export type SearchSettings = { days?: SearchWindow; minViews?: number };

export const WINDOW_CHOICES: SearchWindow[] = [7, 30, 90];
export const MIN_VIEWS_CHOICES = [10_000, 50_000, 100_000] as const;
export const DEFAULT_MIN_VIEWS = 10_000;

/** Credits for one run: TikTok 1 per keyword + 5 creators x 2 pages; Instagram 1 per keyword + 5 creators x 1. */
export function creditEstimate(platforms: string[], keywords: number) {
  return (platforms.includes("tiktok") ? keywords + 10 : 0) + (platforms.includes("instagram") ? keywords + 5 : 0);
}
