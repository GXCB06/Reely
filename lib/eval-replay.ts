// Test-set replay (search quality S0): other ways to order a research's stored results, measured on the same results
// and labels as today's order, so an order change costs no credits and carries no run-to-run noise.
import { EVAL_PLATFORMS, type EvalClip, type EvalPlatform, JUDGE_CLIPS, type Label, topClips, topCreators } from "./eval";
import type { Feedback } from "./feedback";
import type { Goal } from "./goals";
import { bestOrder, labelOrder } from "./ranking";
import type { ScoredVideo } from "./search";

export const REPLAY_VARIANTS = ["live", "beforeS1", "exactOnly"] as const;
export type ReplayVariant = (typeof REPLAY_VARIANTS)[number];

/**
 * The results in a variant's order:
 * - live: today's "best" (exact matches first since S1, then label tier, views × engagement, account fit, 👍/👎);
 * - beforeS1: the order before exact matches came first (label tier first), for the before/after;
 * - exactOnly: only clips scored 2, i.e. the results page's main list now that broader clips have their own section.
 * In exactOnly a clip with no relevance score counts as broader (every test-set result has one after Replay's prepare).
 */
export function replayOrder(variant: ReplayVariant, videos: ScoredVideo[], goal: Goal | null, feedback: Feedback | null): ScoredVideo[] {
  const score = variant === "beforeS1" ? labelOrder(goal, feedback) : bestOrder(goal, feedback);
  const list = variant === "exactOnly" ? videos.filter((v) => v.relevance === 2) : videos;
  return [...list].sort((a, b) => score(b) - score(a));
}

/** Results as the test set's metrics read them. */
export const evalClipsOf = (videos: ScoredVideo[]): EvalClip[] =>
  videos.filter((v) => v.dbId !== undefined).map((v) => ({ id: v.dbId!, platform: v.platform as EvalPlatform, handle: v.creatorHandle }));

/**
 * What a replay still needs for one brief: results without a relevance score, and the clips and creators some
 * variant puts in the judged places (top 10 per platform, every Reel up to 25, top 5 creators) with no label yet.
 */
export function replayGaps(videos: ScoredVideo[], goal: Goal | null, feedback: Feedback | null, labels: Map<string, Label>) {
  const places = judgedPlaces(videos, goal, feedback);
  return {
    unscored: videos.filter((v) => v.relevance === null || v.relevance === undefined),
    clips: places.clips.filter((c) => !labels.has(String(c.id))),
    creators: places.creators.filter((key) => !labels.has(key)),
  };
}

/** Every clip and creator that today's order or any variant puts in a judged place (what the metrics read). */
export function judgedPlaces(videos: ScoredVideo[], goal: Goal | null, feedback: Feedback | null) {
  const clips = new Map<number, EvalClip>();
  const creators = new Set<string>();
  for (const variant of REPLAY_VARIANTS) {
    const order = evalClipsOf(replayOrder(variant, videos, goal, feedback));
    for (const p of EVAL_PLATFORMS) {
      for (const c of topClips(order, p, JUDGE_CLIPS[p])) clips.set(c.id, c);
      for (const key of topCreators(order, p)) creators.add(key);
    }
  }
  return { clips: [...clips.values()], creators: [...creators] };
}
