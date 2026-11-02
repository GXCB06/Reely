// The labelling queue (human-labelled test set): every clip the test set's metrics read, asked once per brief (a brief
// and its re-runs share clips), grouped by brief and in a stable random order, with hidden repeats that measure how
// consistent the labels are. Pure, so the order and the repeats are unit-tested; data in lib/eval-queue-data.ts.
import { EVAL_PLATFORMS, type EvalPlatform, stableHash } from "./eval";

/** A clip in a judged place of one research. `family` = the original research of its brief. */
export type Placement = { family: string; runId: string; item: string; platform: EvalPlatform };
export type FamilyInfo = { family: string; holdout: boolean; order: number };
export type QueueEntry = { family: string; item: string; platform: EvalPlatform; runIds: string[] };

export const familyKey = (family: string, item: string) => `${family}:${item}`;

/**
 * Unique clips per brief, in labelling order: tuning briefs before hold-out ones, each brief's clips together, TikTok
 * then YouTube then Instagram, and a stable random order inside (so rank can't sway the label).
 */
export function queueOrder(placements: Placement[], families: FamilyInfo[]): QueueEntry[] {
  const byKey = new Map<string, QueueEntry>();
  for (const p of placements) {
    const key = familyKey(p.family, p.item);
    const entry = byKey.get(key) ?? { family: p.family, item: p.item, platform: p.platform, runIds: [] };
    if (!entry.runIds.includes(p.runId)) entry.runIds.push(p.runId);
    byKey.set(key, entry);
  }
  const info = new Map(families.map((f) => [f.family, f]));
  const rank = (e: QueueEntry) => {
    const f = info.get(e.family);
    return [f?.holdout ? 1 : 0, f?.order ?? Number.MAX_SAFE_INTEGER, EVAL_PLATFORMS.indexOf(e.platform), stableHash(familyKey(e.family, e.item))];
  };
  return [...byKey.values()].sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  });
}

/** About every this many answers, one earlier clip comes back unmarked. */
export const REPEAT_EVERY = 20;
/** A repeat is at least this many answers old, so it isn't remembered. */
export const REPEAT_GAP = 30;

/**
 * Clips to show again (hidden repeats): labelled, not repeated yet, and not among the last REPEAT_GAP answers; a stable
 * random pick.
 */
export function pickRepeats<T extends { family: string; item: string; at: string; repeated: boolean }>(labelled: T[], n: number): T[] {
  const recentFirst = [...labelled].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return recentFirst
    .slice(REPEAT_GAP)
    .filter((l) => !l.repeated)
    .sort((a, b) => stableHash(`repeat:${familyKey(a.family, a.item)}`) - stableHash(`repeat:${familyKey(b.family, b.item)}`))
    .slice(0, n);
}
