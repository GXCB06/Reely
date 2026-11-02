import "server-only";
import { type AgreementPair, CHECK_PER_PLATFORM, checkHalf, familyHalves, type EvalPlatform, JUDGE_CLIPS, type Label, pickCheckSample, topClips } from "@/lib/eval";
import { clipLabelRows, type EvalBrief } from "@/lib/eval-data";
import { looksThai } from "@/lib/region";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type CheckItem = {
  runId: string;
  item: string;
  platform: EvalPlatform;
  /** Dev (a new judge is tuned on it) or test (measured once). */
  half: "dev" | "test";
  /** The AI judge's label (hidden until the check is done). */
  ai: Label;
  aiReason: string;
  /** The search's own relevance score for the clip, when stored. */
  relevance: number | null;
  /** Your blind label, once given. */
  user: Label | null;
  brief: { title: string; whatItIs: string; audience: string; goal: string | null; region: string };
  clip: { handle: string; caption: string; views: number | null; thumbnailUrl: string | null; platformVideoId: string; videoId: number; url: string };
};

/**
 * The judge check (search quality S0): a fixed sample of judged clips from the newest research of each brief, your
 * blind labels on them, and how far the AI judge and the search's own relevance score agree with you. `briefs` are the
 * test set's briefs already loaded by the page; `set` its rows.
 */
export async function loadCheck(admin: Admin, set: { run_id: string; parent_run_id: string | null; added_at: string }[], briefs: EvalBrief[]) {
  // The newest research of each brief: its latest re-run, or the original.
  const newest = new Map<string, { runId: string; at: string }>();
  for (const r of set) {
    const original = r.parent_run_id ?? r.run_id;
    const cur = newest.get(original);
    if (!cur || r.added_at > cur.at) newest.set(original, { runId: r.run_id, at: r.added_at });
  }
  const runIds = [...newest.values()].map((n) => n.runId);
  const rows = await clipLabelRows<{ run_id: string; item: string; label: number; source: "ai" | "user"; blind: boolean; reason: string | null; repeat_label: number | null }>(
    admin,
    set.map((r) => r.run_id),
    "run_id, item, label, source, blind, reason, repeat_label",
  );
  const at = (r: { run_id: string; item: string }) => `${r.run_id}:${r.item}`;
  const ai = new Map(rows.filter((r) => r.source === "ai").map((r) => [at(r), r]));
  const user = new Map(rows.filter((r) => r.source === "user").map((r) => [at(r), r]));

  const items: CheckItem[] = [];
  for (const b of briefs) {
    if (!runIds.includes(b.run.id)) continue;
    const byId = new Map(b.videos.map((v) => [v.dbId!, v]));
    for (const p of ["tiktok", "youtube", "instagram"] as const) {
      for (const c of topClips(b.clips, p, JUDGE_CLIPS[p])) {
        const key = `${b.run.id}:${c.id}`;
        const judged = ai.get(key);
        const mine = user.get(key);
        // Only clips the judge labelled; a correction made while seeing the AI's label is not blind, so it's left out.
        if (!judged || (mine && !mine.blind)) continue;
        const v = byId.get(c.id)!;
        items.push({
          runId: b.run.id,
          item: String(c.id),
          platform: p,
          half: checkHalf(b.run.id, String(c.id)),
          ai: judged.label as Label,
          aiReason: judged.reason ?? "",
          relevance: v.relevance ?? null,
          user: mine ? (mine.label as Label) : null,
          brief: { title: b.run.title, whatItIs: b.run.product.whatItIs, audience: b.run.product.audience, goal: b.run.goal, region: b.run.region },
          clip: { handle: v.creatorHandle, caption: v.caption, views: v.views, thumbnailUrl: v.thumbnailUrl, platformVideoId: v.platformVideoId, videoId: c.id, url: v.url },
        });
      }
    }
  }
  // Once the check is complete, the clips you labelled ARE the sample: re-judging (a new judge) changes the AI labels the
  // sample is drawn by, and must not swap your labelled clips for new ones.
  const labelled = items.filter((i) => i.user !== null);
  const sample = labelled.length >= CHECK_PER_PLATFORM * 3 ? labelled : pickCheckSample(items);
  const done = sample.filter((s) => s.user !== null);
  const pair = (s: CheckItem, other: number): AgreementPair => ({ platform: s.platform, thai: looksThai(s.clip.caption), user: s.user!, other: other as Label });

  // Every clip you labelled blind (the check and the labelling queue), once per brief: the AI judge and the search's
  // relevance score against all of them, and your own repeats (how consistent the labels are).
  const familyOf = new Map(set.map((r) => [r.run_id, r.parent_run_id ?? r.run_id]));
  const addedAt = new Map(set.map((r) => [r.run_id, r.added_at]));
  const everything = new Map<string, CheckItem>();
  const repeats = new Map<string, { label: Label; repeat: Label }>();
  for (const b of briefs) {
    const family = familyOf.get(b.run.id) ?? b.run.id;
    const byId = new Map(b.videos.map((v) => [String(v.dbId), v]));
    for (const mine of rows.filter((r) => r.run_id === b.run.id && r.source === "user" && r.blind)) {
      const key = `${family}:${mine.item}`;
      if (mine.repeat_label !== null) repeats.set(key, { label: mine.label as Label, repeat: mine.repeat_label as Label });
      const judged = ai.get(at(mine));
      const v = byId.get(mine.item);
      if (!judged || !v) continue;
      const prev = everything.get(key);
      if (prev && (addedAt.get(prev.runId) ?? "") > (addedAt.get(b.run.id) ?? "")) continue;
      everything.set(key, {
        runId: b.run.id,
        item: mine.item,
        platform: v.platform as CheckItem["platform"],
        half: checkHalf(b.run.id, mine.item),
        ai: judged.label as Label,
        aiReason: judged.reason ?? "",
        relevance: v.relevance ?? null,
        user: mine.label as Label,
        brief: { title: b.run.title, whatItIs: b.run.product.whatItIs, audience: b.run.product.audience, goal: b.run.goal, region: b.run.region },
        clip: { handle: v.creatorHandle, caption: v.caption, views: v.views, thumbnailUrl: v.thumbnailUrl, platformVideoId: v.platformVideoId, videoId: v.dbId!, url: v.url },
      });
    }
  }
  const all = [...everything.values()];

  // Every clip you labelled blind with the search's stored relevance score (no AI judge needed), once per brief, split
  // by brief into dev / test for trying a new relevance check.
  const halves = familyHalves(set.filter((r) => !r.parent_run_id).map((r) => r.run_id));
  const scored = new Map<string, RelevanceItem>();
  for (const b of briefs) {
    const family = familyOf.get(b.run.id) ?? b.run.id;
    const byId = new Map(b.videos.map((v) => [String(v.dbId), v]));
    for (const mine of rows.filter((r) => r.run_id === b.run.id && r.source === "user" && r.blind)) {
      const v = byId.get(mine.item);
      const key = `${family}:${mine.item}`;
      const prev = scored.get(key);
      if (!v || (prev && (addedAt.get(prev.runId) ?? "") > (addedAt.get(b.run.id) ?? ""))) continue;
      scored.set(key, {
        runId: b.run.id,
        family,
        item: mine.item,
        half: halves.get(family) ?? "dev",
        platform: v.platform as RelevanceItem["platform"],
        thai: looksThai(v.caption),
        user: mine.label as Label,
        today: (v.relevance ?? null) as Label | null,
        product: b.run.title,
        handle: v.creatorHandle,
        caption: v.caption.slice(0, 220),
      });
    }
  }
  const relevanceItems = [...scored.values()];
  return {
    sample,
    judge: done.map((s) => pair(s, s.ai)),
    filter: done.filter((s) => s.relevance !== null).map((s) => pair(s, s.relevance!)),
    disagreements: done.filter((s) => s.user !== s.ai),
    /** Every clip you labelled blind, once per brief. */
    all,
    judgeAll: all.map((s) => pair(s, s.ai)),
    /** The search's relevance score vs every clip you labelled (not only the ones the AI judge saw). */
    filterAll: relevanceItems
      .filter((r) => r.today !== null)
      .map((r) => ({ platform: r.platform, thai: r.thai, user: r.user, other: r.today! })),
    relevanceItems,
    /** Your first answer vs the hidden repeat (platform unknown here: counted overall). */
    consistency: [...repeats.values()].map((r) => ({ platform: "tiktok" as const, thai: false, user: r.label, other: r.repeat })),
  };
}

/** A clip you labelled, with the search's stored relevance score: what a new relevance check is tried on. */
export type RelevanceItem = {
  runId: string;
  family: string;
  item: string;
  half: "dev" | "test";
  platform: "tiktok" | "youtube" | "instagram";
  thai: boolean;
  user: Label;
  today: Label | null;
  product: string;
  handle: string;
  caption: string;
};
