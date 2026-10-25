import type { SearchRegion } from "@/lib/adapters/types";

/** The region choice in the composer: Thai, worldwide, or a mix of both. */
export type RegionChoice = SearchRegion | "both";
export const REGION_CHOICES: RegionChoice[] = ["th", "global", "both"];

/** Keyword regions for a choice: "both" = 3 Thai + 2 worldwide (5 keywords max per run). */
export function keywordRegions(choice: RegionChoice, count: number): SearchRegion[] {
  if (choice !== "both") return Array(count).fill(choice);
  const thai = Math.ceil(count * 0.6);
  return Array.from({ length: count }, (_, i) => (i < thai ? "th" : "global"));
}

/** True when a caption is written in Thai script; used for the 🇹🇭 / 🌏 badge on cards. */
export function looksThai(text: string): boolean {
  return /[฀-๿]/.test(text);
}
