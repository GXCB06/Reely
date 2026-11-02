import "server-only";
import type { EvalPlatform, Label } from "@/lib/eval";
import { clipLabelRows, type EvalBrief } from "@/lib/eval-data";
import { familyKey, type FamilyInfo, type Placement, pickRepeats, type QueueEntry, queueOrder } from "@/lib/eval-queue";
import { judgedPlaces } from "@/lib/eval-replay";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
export type SetRow = { run_id: string; holdout: boolean; parent_run_id: string | null; added_at: string };

/** Clips sent to the page at a time (the page asks for the next batch when they run out). */
export const QUEUE_BATCH = 40;
const REPEATS_PER_BATCH = 2;
/** Once every clip is labelled: earlier clips shown again, unmarked, to measure how consistent the labels are. */
export const REPEAT_ROUND = 30;

export type LabelClip = {
  family: string;
  item: string;
  platform: EvalPlatform;
  brief: { title: string; whatItIs: string; audience: string; goal: string | null; region: string; text: string };
  clip: { handle: string; caption: string; views: number | null; thumbnailUrl: string | null; platformVideoId: string; videoId: number; url: string };
};

/**
 * The labelling queue: every clip the test set's metrics read (any order variant's judged places), once per brief,
 * minus the ones you already labelled blind. Returns the next batch, a few hidden repeats, progress, and your
 * label/repeat pairs (how consistent the labels are).
 */
export async function loadQueue(admin: Admin, set: SetRow[], briefs: EvalBrief[]) {
  const familyOf = new Map(set.map((r) => [r.run_id, r.parent_run_id ?? r.run_id]));
  const originals = set.filter((r) => !r.parent_run_id).sort((a, b) => (a.added_at < b.added_at ? -1 : 1));
  const families: FamilyInfo[] = originals.map((r, i) => ({ family: r.run_id, holdout: r.holdout, order: i }));
  const placements: Placement[] = briefs.flatMap((b) =>
    judgedPlaces(b.videos, b.run.goal, b.feedback).clips.map((c) => ({
      family: familyOf.get(b.run.id) ?? b.run.id,
      runId: b.run.id,
      item: String(c.id),
      platform: c.platform,
    })),
  );
  const entries = queueOrder(placements, families);
  const entryOf = new Map(entries.map((e) => [familyKey(e.family, e.item), e]));

  const data = await clipLabelRows<{ run_id: string; item: string; label: number; judged_at: string; repeat_label: number | null }>(
    admin,
    set.map((r) => r.run_id),
    "run_id, item, label, judged_at, repeat_label",
    { source: "user", blind: true },
  );
  // One answer per clip per brief (the same label is stored on each research of the brief).
  const labelled = new Map<string, { family: string; item: string; at: string; repeated: boolean; label: Label; repeat: Label | null }>();
  for (const r of data) {
    const family = familyOf.get(r.run_id) ?? r.run_id;
    const key = familyKey(family, r.item);
    const prev = labelled.get(key);
    labelled.set(key, {
      family,
      item: r.item,
      at: prev && prev.at > r.judged_at ? prev.at : r.judged_at,
      repeated: (prev?.repeated ?? false) || r.repeat_label !== null,
      label: r.label as Label,
      repeat: prev?.repeat ?? (r.repeat_label as Label | null),
    });
  }

  const briefOf = new Map(briefs.map((b) => [b.run.id, b]));
  const detail = (e: QueueEntry): LabelClip | null => {
    const b = briefOf.get(e.runIds[0]);
    const v = b?.videos.find((x) => String(x.dbId) === e.item);
    if (!b || !v) return null;
    return {
      family: e.family,
      item: e.item,
      platform: e.platform,
      brief: { title: b.run.title, whatItIs: b.run.product.whatItIs, audience: b.run.product.audience, goal: b.run.goal, region: b.run.region, text: b.run.brief.slice(0, 600) },
      clip: { handle: v.creatorHandle, caption: v.caption, views: v.views, thumbnailUrl: v.thumbnailUrl, platformVideoId: v.platformVideoId, videoId: v.dbId!, url: v.url },
    };
  };

  const todo = entries.filter((e) => !labelled.has(familyKey(e.family, e.item)));
  const inQueue = [...labelled.values()].filter((l) => entryOf.has(familyKey(l.family, l.item)));
  const perFamily: Record<string, { done: number; total: number }> = {};
  for (const e of entries) {
    const p = (perFamily[e.family] ??= { done: 0, total: 0 });
    p.total++;
    if (labelled.has(familyKey(e.family, e.item))) p.done++;
  }
  return {
    total: entries.length,
    done: entries.length - todo.length,
    batch: todo.slice(0, QUEUE_BATCH).map(detail).filter((x) => x !== null),
    repeats: pickRepeats(inQueue, REPEATS_PER_BATCH)
      .map((l) => detail(entryOf.get(familyKey(l.family, l.item))!))
      .filter((x) => x !== null),
    perFamily,
    /** After the queue: earlier clips to label again (never the last answers, never one already repeated). */
    repeatRound: pickRepeats(inQueue, REPEAT_ROUND)
      .map((l) => detail(entryOf.get(familyKey(l.family, l.item))!))
      .filter((x) => x !== null),
    /** Your first and second answer on the same clip. */
    repeatPairs: inQueue.filter((l) => l.repeat !== null).map((l) => ({ label: l.label, repeat: l.repeat! })),
  };
}
