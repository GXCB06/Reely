// "Analyse my channel" (v0.3 Part B2): the AI cites the founder's posts as P1, P2… and watched clips as C1, C2…; this
// turns those labels back into video ids and drops any label it made up. Pure, so it is unit-tested.
import type { PostTag } from "@/lib/account-analysis";
import type { ChannelAuditOutput, PostTagsOutput } from "@/lib/ai/schemas";

export type AuditPoint = { point: string; videoIds: number[] };
export type AuditIdea = { title: string; hook: string; angle: string; why: string; videoIds: number[] };

/** What `own_accounts.audit` stores. */
export type StoredAudit = {
  summary: string;
  commonInHits: AuditPoint[];
  weakPattern: AuditPoint[];
  gaps: AuditPoint[];
  ideas: AuditIdea[];
  /** How many of the founder's posts and watched clips the analysis read. */
  postsRead: number;
  clipsRead: number;
};

/**
 * Labels → video ids: `posts[i]` is P{i+1}, `clips[i]` is C{i+1}. Unknown labels are dropped, and a point left with
 * no source is dropped too (every claim must point at something the founder can open). Ideas keep their place even
 * with no source, since an idea can be new.
 */
export function resolveAudit(raw: ChannelAuditOutput, posts: number[], clips: number[]): StoredAudit {
  const lookup = (label: string): number | null => {
    const m = label.trim().toUpperCase().match(/^([PC])\s*(\d+)$/);
    if (!m) return null;
    const list = m[1] === "P" ? posts : clips;
    return list[Number(m[2]) - 1] ?? null;
  };
  const ids = (labels: string[]) => [...new Set(labels.map(lookup).filter((id): id is number => id !== null))];
  const points = (list: { point: string; posts?: string[]; clips?: string[] }[]) =>
    list.map((p) => ({ point: p.point, videoIds: ids(p.posts ?? p.clips ?? []) })).filter((p) => p.videoIds.length > 0);
  return {
    summary: raw.summary,
    commonInHits: points(raw.commonInHits),
    weakPattern: points(raw.weakPattern),
    gaps: points(raw.gaps),
    ideas: raw.ideas.map((i) => ({ title: i.title, hook: i.hook, angle: i.angle, why: i.why, videoIds: ids(i.basedOn) })),
    postsRead: posts.length,
    clipsRead: clips.length,
  };
}

/** Post tags (format + hook type) by video id, from the AI's P1, P2… labels; unknown labels are dropped. */
export function resolveTags(raw: PostTagsOutput, posts: number[]): Record<string, PostTag> {
  const out: Record<string, PostTag> = {};
  for (const t of raw.tags) {
    const n = t.post.trim().toUpperCase().match(/^P\s*(\d+)$/)?.[1];
    const id = n ? posts[Number(n) - 1] : undefined;
    if (id !== undefined) out[String(id)] = { format: t.format, hook: t.hook };
  }
  return out;
}
