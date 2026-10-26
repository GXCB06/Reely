// 👍/👎 per product: what Reely learns from them. No server imports (shared by the server and tests).

export type Vote = 1 | -1;

type Clip = { platform: string; platformVideoId: string; creatorHandle: string };
/** A voted clip as stored (with the video it points at). */
export type VotedClip = Clip & { vote: Vote; caption: string };

export type Feedback = {
  liked: Set<string>;
  disliked: Set<string>;
  likedCreators: Set<string>;
  dislikedCreators: Set<string>;
  /** Most recent first, for the AI's examples. */
  examples: { liked: VotedClip[]; disliked: VotedClip[] };
};

export const clipKey = (v: { platform: string; platformVideoId: string }) => `${v.platform}:${v.platformVideoId}`;
const creatorKey = (v: { platform: string; creatorHandle: string }) => `${v.platform}:${v.creatorHandle.toLowerCase()}`;

/** Examples the AI sees per side; enough to show taste without crowding the prompt. */
const MAX_EXAMPLES = 8;

export function buildFeedback(clips: VotedClip[]): Feedback | null {
  if (!clips.length) return null;
  const liked = clips.filter((c) => c.vote === 1);
  const disliked = clips.filter((c) => c.vote === -1);
  return {
    liked: new Set(liked.map(clipKey)),
    disliked: new Set(disliked.map(clipKey)),
    likedCreators: new Set(liked.map(creatorKey)),
    dislikedCreators: new Set(disliked.map(creatorKey)),
    examples: { liked: liked.slice(0, MAX_EXAMPLES), disliked: disliked.slice(0, MAX_EXAMPLES) },
  };
}

/** How much a vote moves a clip inside its label tier: the clip itself most, then its creator's other clips. */
export function feedbackFactor(v: Clip, f: Feedback | null): number {
  if (!f) return 1;
  if (f.disliked.has(clipKey(v))) return 0.3;
  if (f.liked.has(clipKey(v))) return 1.4;
  if (f.dislikedCreators.has(creatorKey(v))) return 0.75;
  if (f.likedCreators.has(creatorKey(v))) return 1.25;
  return 1;
}

/** Wraps a score (label tier × 1e12 + the rest) so votes reorder clips inside a tier, never across labels. */
export function withFeedback<T extends Clip>(score: (v: T) => number, f: Feedback | null): (v: T) => number {
  if (!f) return score;
  return (v) => {
    const s = score(v);
    const tier = Math.floor(s / 1e12) * 1e12;
    return tier + (s - tier) * feedbackFactor(v, f);
  };
}
