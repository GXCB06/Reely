"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { modelName } from "@/lib/ai/model";
import { judgeRelevance } from "@/lib/ai/tasks";
import { EVAL_PLATFORMS, JUDGE_CLIPS, creatorItem, topClips, topCreators } from "@/lib/eval";
import { loadEvalBrief } from "@/lib/eval-data";
import { isGoal } from "@/lib/goals";
import { isOwner } from "@/lib/limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { runResearchAction } from "../research/actions";

/** Every action here is for owners only (REELY_OWNER_EMAILS) and uses the service role after that check. */
async function ownerAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!isOwner(data?.claims?.email as string | undefined)) return null;
  return createAdminClient();
}

const runId = z.string().uuid();
const refresh = () => revalidatePath("/[locale]/app/eval", "page");

/** Adds a research to the test set (or takes it out). */
export async function setInTestSetAction(id: string, on: boolean) {
  const admin = await ownerAdmin();
  const parsed = runId.safeParse(id);
  if (!admin || !parsed.success) return { ok: false as const };
  const { error } = on
    ? await admin.from("eval_briefs").upsert({ run_id: parsed.data }, { onConflict: "run_id", ignoreDuplicates: true })
    : await admin.from("eval_briefs").delete().eq("run_id", parsed.data);
  refresh();
  return { ok: !error };
}

/** Core briefs are the ones re-run live after big search changes. */
export async function setCoreAction(id: string, core: boolean) {
  const admin = await ownerAdmin();
  const parsed = runId.safeParse(id);
  if (!admin || !parsed.success) return { ok: false as const };
  const { error } = await admin.from("eval_briefs").update({ core }).eq("run_id", parsed.data);
  refresh();
  return { ok: !error };
}

/**
 * Judges one brief's top clips (10 per platform, every Reel up to 25) and top 5 creators per platform with the strict
 * judge: two AI calls, no credits. Creator lines use captions already stored in the shared videos table.
 */
export async function judgeBriefAction(id: string) {
  const admin = await ownerAdmin();
  const parsed = runId.safeParse(id);
  if (!admin || !parsed.success) return { ok: false as const };
  const brief = await loadEvalBrief(admin, parsed.data);
  if (!brief) return { ok: false as const };
  const { run, videos, clips } = brief;
  const byId = new Map(videos.map((v) => [v.dbId!, v]));

  const clipList = EVAL_PLATFORMS.flatMap((p) => topClips(clips, p, JUDGE_CLIPS[p]));
  // The handle as stored (creator keys are lower-cased).
  const handleOf = new Map(clips.map((c) => [creatorItem(c.platform, c.handle), c.handle]));
  const creatorKeys = EVAL_PLATFORMS.flatMap((p) => topCreators(clips, p));
  const captions = await Promise.all(
    creatorKeys.map(async (key) => {
      const platform = key.slice(0, key.indexOf(":"));
      const handle = handleOf.get(key) ?? key.slice(key.indexOf(":") + 1);
      const { data } = await admin
        .from("videos")
        .select("caption")
        .eq("platform", platform)
        .eq("creator_handle", handle)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(5);
      return { platform, handle, text: (data ?? []).map((r) => (r.caption as string) ?? "").filter(Boolean).join(" / ") };
    }),
  );

  const [clipLabels, creatorLabels] = await Promise.all([
    judgeRelevance(
      run.product,
      run.goal,
      run.region,
      "clip",
      clipList.map((c) => {
        const v = byId.get(c.id)!;
        return { platform: c.platform, handle: c.handle, text: v.caption || "(no caption)", views: v.views };
      }),
    ),
    judgeRelevance(
      run.product,
      run.goal,
      run.region,
      "creator",
      captions.map((c) => ({ platform: c.platform, handle: c.handle, text: c.text || "(no captions stored)", views: null })),
    ),
  ]);
  if (!clipLabels && !creatorLabels) return { ok: false as const };

  const model = modelName();
  const rows = [
    ...(clipLabels ?? []).map((l) => ({ item: String(clipList[l.i].id), kind: "clip", platform: clipList[l.i].platform, label: l.label, reason: l.reason })),
    ...(creatorLabels ?? []).map((l) => ({
      item: creatorItem(captions[l.i].platform, captions[l.i].handle),
      kind: "creator",
      platform: captions[l.i].platform,
      label: l.label,
      reason: l.reason,
    })),
  ].map((r) => ({ ...r, run_id: parsed.data, source: "ai", model, reason: r.reason.slice(0, 300), judged_at: new Date().toISOString() }));
  const { error } = await admin.from("relevance_labels").upsert(rows, { onConflict: "run_id,item,source" });
  refresh();
  return { ok: !error, judged: rows.length, partial: !clipLabels || !creatorLabels };
}

/** The owner's correction of one label (null takes the correction back, so the AI label counts again). */
export async function setLabelAction(id: string, item: string, kind: "clip" | "creator", platform: string, label: number | null) {
  const admin = await ownerAdmin();
  const parsed = z
    .object({
      id: runId,
      item: z.string().min(1).max(120),
      kind: z.enum(["clip", "creator"]),
      platform: z.enum(EVAL_PLATFORMS),
      label: z.union([z.literal(0), z.literal(1), z.literal(2), z.null()]),
    })
    .safeParse({ id, item, kind, platform, label });
  if (!admin || !parsed.success) return { ok: false as const };
  const d = parsed.data;
  const { error } =
    d.label === null
      ? await admin.from("relevance_labels").delete().eq("run_id", d.id).eq("item", d.item).eq("source", "user")
      : await admin
          .from("relevance_labels")
          .upsert(
            { run_id: d.id, item: d.item, kind: d.kind, platform: d.platform, label: d.label, source: "user", judged_at: new Date().toISOString() },
            { onConflict: "run_id,item,source" },
          );
  refresh();
  return { ok: !error };
}

/** Saves the metric table as it is now ("before 1.5"), to compare later search changes with. */
export async function saveSnapshotAction(note: string, metrics: unknown) {
  const admin = await ownerAdmin();
  const parsed = z.object({ note: z.string().trim().max(120), metrics: z.record(z.string(), z.unknown()) }).safeParse({ note, metrics });
  if (!admin || !parsed.success) return { ok: false as const };
  const { error } = await admin
    .from("eval_snapshots")
    .insert({ note: parsed.data.note || null, metrics: parsed.data.metrics, git_sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null });
  refresh();
  return { ok: !error };
}

/** Adds several researches at once (the suggested starting set is added as core briefs). */
export async function addBriefsAction(ids: string[], core: boolean) {
  const admin = await ownerAdmin();
  const parsed = z.array(runId).max(50).safeParse(ids);
  if (!admin || !parsed.success) return { ok: false as const };
  const { error } = await admin
    .from("eval_briefs")
    .upsert(parsed.data.map((run_id) => ({ run_id, core })), { onConflict: "run_id" });
  refresh();
  return { ok: !error };
}

/**
 * Re-runs a test brief with the same product, goal, region, platforms, settings and KEYWORDS (so the comparison is the
 * search, not the keyword planner) and adds the new research to the set, linked to the original. Spends credits like
 * any research (~30-40), so the page asks first.
 */
export async function rerunBriefAction(id: string, lang: string) {
  const admin = await ownerAdmin();
  const parsed = z.object({ id: runId, lang: z.enum(["th", "en"]) }).safeParse({ id, lang });
  if (!admin || !parsed.success) return { ok: false as const, error: "invalid" as const };
  const { data: run } = await admin
    .from("research_runs")
    .select("id, brief, keywords, keyword_regions, keyword_english, exclusions, platforms, region, goal, settings, input, product_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!run || !isGoal(run.goal)) return { ok: false as const, error: "noGoal" as const };
  const input = (run.input ?? {}) as { text?: string; url?: string | null; productName?: string; whatItIs?: string; audience?: string; reply?: string; competitors?: string[] };
  const keywords = ((run.keywords as string[]) ?? []).map((text, i) => ({
    text,
    region: (((run.keyword_regions as string[] | null) ?? [])[i] === "global" ? "global" : "th") as "th" | "global",
    english: ((run.keyword_english as string[] | null) ?? [])[i] || undefined,
  }));
  const settings = (run.settings ?? {}) as { days?: number; minViews?: number; language?: string };
  const res = await runResearchAction({
    requestId: crypto.randomUUID(),
    text: (input.text ?? run.brief ?? "").slice(0, 1000),
    url: input.url ?? "",
    imageThumb: null,
    understanding: {
      productName: (input.productName || "Product").slice(0, 80),
      whatItIs: (input.whatItIs ?? "").slice(0, 300),
      audience: (input.audience ?? "").slice(0, 200),
      reply: (input.reply ?? "").slice(0, 400),
      competitors: (input.competitors ?? []).slice(0, 6),
    },
    keywords,
    exclusions: (run.exclusions as string[]) ?? [],
    platforms: (run.platforms as ("tiktok" | "youtube" | "instagram")[]) ?? ["tiktok", "youtube"],
    region: (run.region as "th" | "global" | "both") ?? "th",
    goal: run.goal,
    settings: {
      days: ([7, 30, 90].includes(settings.days ?? 90) ? settings.days : 90) as 7 | 30 | 90,
      minViews: settings.minViews ?? 10_000,
      language: (["any", "th", "en"].includes(settings.language ?? "any") ? settings.language : "any") as "any" | "th" | "en",
    },
    productId: (run.product_id as string | null) ?? null,
    locale: parsed.data.lang,
  }).catch((e: Error) => {
    console.error("[eval] re-run failed", e.message);
    return null;
  });
  if (!res?.runId) return { ok: false as const, error: (res && "error" in res ? res.error : "failed") as string };
  await admin.from("eval_briefs").upsert({ run_id: res.runId, parent_run_id: parsed.data.id, core: false }, { onConflict: "run_id" });
  refresh();
  return { ok: true as const, runId: res.runId };
}
