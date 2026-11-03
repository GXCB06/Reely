// Keyword scorecard (search quality S4, measure first): for every planned search keyword of the test set, how many
// results it brought, how many the search's relevance check called exact, and how many the owner labelled on target.
// Grouped by keyword kind (own brand, competitor, review, how-to, category, problem) and language, so the keyword planner
// can be changed from evidence. Pure, so the grouping is unit-tested.
import type { EvalPlatform, Label } from "./eval";
import { looksThai } from "./region";

export type KeywordKind = "own" | "competitor" | "review" | "howto" | "category" | "other" | "feeds";

/** A result of one brief (deduplicated across the brief's researches), with the keyword that found it. */
export type ScoreClip = { videoId: string; platform: EvalPlatform; keyword: string; relevance: number | null; human: Label | null };
export type ScoreBrief = { family: string; title: string; productName: string; competitors: string[]; keywords: string[]; clips: ScoreClip[] };

export type KeywordRow = {
  family: string;
  title: string;
  keyword: string;
  kind: KeywordKind;
  thai: boolean;
  results: number;
  byPlatform: Partial<Record<EvalPlatform, number>>;
  /** Scored 2 by the search's relevance check. */
  exact: number;
  /** Labelled by the owner, and of those labelled 2. */
  labelled: number;
  onTarget: number;
};

/** Everyday words that appear in product names but don't name a brand ("Fitbod: Gym & Fitness Planner"). */
const GENERIC = new Set(
  "app apps saas tool tools software pro plus ultra smart online best review product products account accounting fitness gym workout planner scan feed content creator creators video videos marketing business shop store the for and".split(
    " ",
  ),
);

/** The brand word of a name: its first Latin word of 3+ letters that isn't an everyday word, else the whole name. */
export function brandWord(name: string): string | null {
  const words = name.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  if (!words.length) return name.trim() ? name.trim().toLowerCase() : null;
  return words.find((w) => !GENERIC.has(w)) ?? name.trim().toLowerCase();
}

/**
 * What a keyword is: the user's own product or a competitor (by its brand word), a review or comparison, a how-to or
 * tips phrase, a category phrase (an app, tool or product of a kind), or anything else (a problem or situation).
 */
export function keywordKind(keyword: string, productName: string, competitors: string[]): Exclude<KeywordKind, "feeds"> {
  const k = keyword.toLowerCase();
  const has = (name: string) => {
    const w = brandWord(name);
    return w !== null && k.includes(w);
  };
  if (has(productName)) return "own";
  if (competitors.some(has)) return "competitor";
  if (/รีวิว|review|\bvs\b|เปรียบเทียบ|compare/.test(k)) return "review";
  if (/how to|วิธี|สอน|tips|เทคนิค|ทริค|\bideas?\b|ไอเดีย/.test(k)) return "howto";
  if (/\bapps?\b|แอป|\btools?\b|โปรแกรม|software|เครื่องมือ|อุปกรณ์|กล้อง|ไมค์|ไมโครโฟน/.test(k)) return "category";
  return "other";
}

/**
 * One row per planned keyword of each brief, plus one "feeds" row per brief for results credited to a keyword that
 * wasn't planned (Instagram Reels found through accounts carry the account search's query).
 */
export function keywordRows(briefs: ScoreBrief[]): KeywordRow[] {
  const rows: KeywordRow[] = [];
  for (const b of briefs) {
    const planned = new Set(b.keywords);
    const row = (keyword: string, kind: KeywordKind, clips: ScoreClip[]): KeywordRow => {
      const byPlatform: Partial<Record<EvalPlatform, number>> = {};
      for (const c of clips) byPlatform[c.platform] = (byPlatform[c.platform] ?? 0) + 1;
      const labelled = clips.filter((c) => c.human !== null);
      return {
        family: b.family,
        title: b.title,
        keyword,
        kind,
        thai: looksThai(keyword),
        results: clips.length,
        byPlatform,
        exact: clips.filter((c) => c.relevance === 2).length,
        labelled: labelled.length,
        onTarget: labelled.filter((c) => c.human === 2).length,
      };
    };
    for (const k of b.keywords) rows.push(row(k, keywordKind(k, b.productName, b.competitors), b.clips.filter((c) => c.keyword === k)));
    const other = b.clips.filter((c) => !planned.has(c.keyword));
    if (other.length) rows.push(row("", "feeds", other));
  }
  return rows;
}

export type KeywordGroup = { key: string; keywords: number; results: number; exact: number; onTarget: number; labelled: number };

/** Totals per group of keywords: how many keywords, results, exact matches and on-target clips (owner's labels). */
export function keywordGroups(rows: KeywordRow[], by: (r: KeywordRow) => string): KeywordGroup[] {
  const groups = new Map<string, KeywordGroup>();
  for (const r of rows) {
    const key = by(r);
    const g = groups.get(key) ?? { key, keywords: 0, results: 0, exact: 0, onTarget: 0, labelled: 0 };
    g.keywords++;
    g.results += r.results;
    g.exact += r.exact;
    g.onTarget += r.onTarget;
    g.labelled += r.labelled;
    groups.set(key, g);
  }
  return [...groups.values()];
}
