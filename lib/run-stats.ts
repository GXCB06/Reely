// Totals for a research's results (the summary tiles) and the hashtags in their captions. No server imports (tested directly).

// Letters, combining marks (Thai vowels and tone marks), digits and underscores.
const HASHTAG = /#[\p{L}\p{M}\p{N}_]+/gu;

// Tags that say nothing about the topic: left out of "most used hashtags" (still counted in the total).
const GENERIC = new Set([
  "fyp", "fy", "fypシ", "fypシ゚viral", "foryou", "foryoupage", "fypage", "viral", "viralvideo", "trending", "trend",
  "tiktok", "tiktokthailand", "shorts", "short", "youtubeshorts", "reels", "reel", "instagram", "instareels",
  "explore", "explorepage", "xyzbca", "capcut", "ฟีด", "ฟีดดดシ", "เทรนด์วันนี้", "อย่าปิดการมองเห็น",
]);

export type HashtagCount = { tag: string; count: number };
export type RunTotals = {
  videos: number;
  views: number;
  avgViews: number;
  creators: number;
  hashtags: number;
  topHashtags: HashtagCount[];
};

/** The distinct hashtags in a caption, lower-cased, without the "#". */
export function hashtagsOf(caption: string | null | undefined): string[] {
  return [...new Set((caption ?? "").match(HASHTAG)?.map((h) => h.slice(1).toLowerCase()) ?? [])];
}

export const isGenericTag = (tag: string) => GENERIC.has(tag) || /^(fyp|foryou|viral)/.test(tag);

export function runTotals(
  videos: { caption: string; views: number | null; platform: string; creatorHandle: string }[],
  topN = 8,
): RunTotals {
  const views = videos.reduce((sum, v) => sum + (v.views ?? 0), 0);
  const counted = videos.filter((v) => v.views !== null).length;
  const creators = new Set(videos.map((v) => `${v.platform}:${v.creatorHandle.toLowerCase()}`)).size;
  const tags = new Map<string, number>();
  for (const v of videos) for (const tag of hashtagsOf(v.caption)) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  const topHashtags = [...tags]
    .filter(([tag, count]) => count >= 2 && !isGenericTag(tag))
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([tag, count]) => ({ tag, count }));
  return { videos: videos.length, views, avgViews: counted ? Math.round(views / counted) : 0, creators, hashtags: tags.size, topHashtags };
}
