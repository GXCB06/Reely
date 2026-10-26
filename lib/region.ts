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

/**
 * A video's caption language: the platform's own tag when it has one (TikTok), otherwise a guess from the
 * caption (Thai script → "th", mostly Latin letters → "en"). Null when there is too little text to tell.
 */
export function captionLanguage(v: { language?: string | null; caption: string }): string | null {
  if (v.language) return v.language.toLowerCase().slice(0, 2);
  if (looksThai(v.caption)) return "th";
  const letters = v.caption.replace(/[#@]\S+/g, "").match(/\p{L}/gu) ?? [];
  if (letters.length < 8) return null;
  return letters.filter((c) => /[a-z]/i.test(c)).length / letters.length > 0.8 ? "en" : null;
}

/** True when a caption is written in Thai script; used for the 🇹🇭 / 🌏 badge on cards. */
export function looksThai(text: string): boolean {
  return /[฀-๿]/.test(text);
}
