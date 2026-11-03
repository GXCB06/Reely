// "Did it work?" (v0.3 round 2, C2): a canvas version becomes a real post on the founder's channel, and Reely shows
// how it did against the channel's own usual. Pure, so the matching and the summary are unit-tested.
import { BREAKOUT_AT, median, STRONG_AT } from "@/lib/scoring";

/** Posts this long after a version can still be the one made from it. */
export const MATCH_WINDOW_DAYS = 30;
/** A suggestion on the channel page needs at least this much caption overlap (the "I posted this" list shows all). */
export const SUGGEST_SCORE = 0.2;
/** The "Made with Reely" line needs this many linked posts before it says anything. */
export const SUMMARY_MIN = 3;
/** Views keep coming in for a few days after posting. */
export const GROWING_DAYS = 3;

/** Letter pairs of a text without spaces or punctuation: works for Thai (no spaces between words) and English alike. */
function pairs(text: string): Set<string> {
  const s = text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** How alike two captions are (0-1): shared letter pairs ÷ all letter pairs (Jaccard). */
export function captionOverlap(a: string, b: string): number {
  const pa = pairs(a);
  const pb = pairs(b);
  if (!pa.size || !pb.size) return 0;
  let shared = 0;
  for (const p of pa) if (pb.has(p)) shared++;
  return shared / (pa.size + pb.size - shared);
}

export type CandidatePost = { id: number; caption: string; publishedAt: string | null };

/**
 * The posts a version could have become: published from the day before it was written up to 30 days after, the most
 * alike caption first (ties: the earliest post), each with its overlap score.
 */
export function matchCandidates<T extends CandidatePost>(version: { text: string; createdAt: string }, posts: T[]): (T & { score: number })[] {
  const from = Date.parse(version.createdAt) - 864e5;
  const to = Date.parse(version.createdAt) + MATCH_WINDOW_DAYS * 864e5;
  return posts
    .filter((p) => p.publishedAt && Date.parse(p.publishedAt) >= from && Date.parse(p.publishedAt) <= to)
    .map((p) => ({ ...p, score: captionOverlap(version.text, p.caption) }))
    .sort((a, b) => b.score - a.score || Date.parse(a.publishedAt!) - Date.parse(b.publishedAt!));
}

export type PostResult = {
  views: number | null;
  /** Views ÷ the channel's usual. */
  x: number | null;
  label: "breakout" | "strong" | "normal";
  /** Days since it was posted. */
  days: number | null;
  /** Still in its first days, so the numbers will grow. */
  growing: boolean;
};

/** How a linked post did: views, × the channel's usual, the label, and whether it is still too new to judge. */
export function postResult(views: number | null, usual: number | null, publishedAt: string | null, now = Date.now()): PostResult {
  const x = views !== null && usual ? views / usual : null;
  const days = publishedAt ? Math.max(0, Math.floor((now - Date.parse(publishedAt)) / 864e5)) : null;
  return {
    views,
    x,
    label: x !== null && x >= BREAKOUT_AT ? "breakout" : x !== null && x >= STRONG_AT ? "strong" : "normal",
    days,
    growing: days !== null && days < GROWING_DAYS,
  };
}

/**
 * The proof-of-value line: median × usual of posts made from Reely versions vs the channel's other posts. Null under
 * SUMMARY_MIN linked posts, so it never claims anything from one or two videos.
 */
export function madeWithReelySummary(linked: (number | null)[], others: (number | null)[]): { count: number; linked: number; others: number | null } | null {
  const l = linked.filter((x): x is number => x !== null);
  if (l.length < SUMMARY_MIN) return null;
  return { count: l.length, linked: median(l)!, others: median(others.filter((x): x is number => x !== null)) };
}
