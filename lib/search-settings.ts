// Search settings shared by the chat (client) and the server. No server imports.
import type { SearchWindow } from "@/lib/adapters/types";

/** Keep only videos whose caption is in this language ("any" keeps all). */
export type ContentLanguage = "any" | "th" | "en";
export const LANGUAGE_CHOICES: ContentLanguage[] = ["any", "th", "en"];

/** What the user chose before searching: how far back, the fewest views, and the caption language. */
export type SearchSettings = { days?: SearchWindow; minViews?: number; language?: ContentLanguage };

export const WINDOW_CHOICES: SearchWindow[] = [7, 30, 90];
export const MIN_VIEWS_CHOICES = [10_000, 50_000, 100_000] as const;
export const DEFAULT_MIN_VIEWS = 10_000;

/**
 * Researches per person per Thai day (owners have no cap; lib/limits.ts). null = no cap: while Reely collects
 * feedback, everyone can research as much as they like (watch the credits on the account page).
 */
export const RESEARCHES_PER_DAY: number | null = null;

/**
 * Credits for one run: TikTok 1 per keyword + 5 creators x 2 pages; Instagram 1 per keyword + 5 creators x 1
 * (8 creators when Reels are searched without TikTok).
 */
export function creditEstimate(platforms: string[], keywords: number) {
  const tiktok = platforms.includes("tiktok");
  // Instagram: + 2 more pages of reels for the top 3 creators (6), + Thai TikTok creators found there (~1).
  return (tiktok ? keywords + 10 : 0) + (platforms.includes("instagram") ? keywords + (tiktok ? 5 : 8) + 6 + (tiktok ? 1 : 0) : 0);
}
