import "server-only";
import { type AgreementPair, type EvalPlatform, JUDGE_CLIPS, type Label, pickCheckSample, topClips } from "@/lib/eval";
import type { EvalBrief } from "@/lib/eval-data";
import { looksThai } from "@/lib/region";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type CheckItem = {
  runId: string;
  item: string;
  platform: EvalPlatform;
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
  const { data } = runIds.length
    ? await admin.from("relevance_labels").select("run_id, item, label, source, blind, reason").eq("kind", "clip").in("run_id", runIds)
    : { data: [] };
  const rows = (data ?? []) as { run_id: string; item: string; label: number; source: "ai" | "user"; blind: boolean; reason: string | null }[];
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
  const sample = pickCheckSample(items);
  const done = sample.filter((s) => s.user !== null);
  const pair = (s: CheckItem, other: number): AgreementPair => ({ platform: s.platform, thai: looksThai(s.clip.caption), user: s.user!, other: other as Label });
  return {
    sample,
    judge: done.map((s) => pair(s, s.ai)),
    filter: done.filter((s) => s.relevance !== null).map((s) => pair(s, s.relevance!)),
    disagreements: done.filter((s) => s.user !== s.ai),
  };
}
