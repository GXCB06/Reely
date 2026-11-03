"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { modelName } from "@/lib/ai/model";
import { JUDGE_VERSION, JUDGE_VERSIONS, judgeRelevance, RELEVANCE_VERSIONS, rateRelevance, understandProduct } from "@/lib/ai/tasks";
import { EVAL_PLATFORMS, type EvalClip, JUDGE_CLIPS, creatorItem, topClips, topCreators } from "@/lib/eval";
import { type EvalBrief, loadEvalBrief } from "@/lib/eval-data";
import { replayGaps } from "@/lib/eval-replay";
import { isGoal } from "@/lib/goals";
import { isOwner } from "@/lib/limits";
import { readLink } from "@/lib/link-preview";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { startResearch } from "../research/actions";

/** Every action here is for owners only (REELY_OWNER_EMAILS) and uses the service role after that check. */
async function ownerAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!isOwner(data?.claims?.email as string | undefined)) return null;
  return createAdminClient();
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

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
  const { clips } = brief;
  const res = await judgeItems(
    admin,
    brief,
    EVAL_PLATFORMS.flatMap((p) => topClips(clips, p, JUDGE_CLIPS[p])),
    EVAL_PLATFORMS.flatMap((p) => topCreators(clips, p)),
  );
  refresh();
  return res;
}

/**
 * Judges the given clips and creators of one brief (one AI call each, no credits) and stores the AI labels. Creator
 * lines use captions already stored in the shared videos table.
 */
async function judgeItems(admin: Admin, brief: EvalBrief, clipList: EvalClip[], creatorKeys: string[]) {
  const { run, videos, clips } = brief;
  if (!clipList.length && !creatorKeys.length) return { ok: true as const, judged: 0, partial: false };
  const byId = new Map(videos.map((v) => [v.dbId!, v]));
  // The handle as stored (creator keys are lower-cased).
  const handleOf = new Map(clips.map((c) => [creatorItem(c.platform, c.handle), c.handle]));
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
      { brief: run.brief },
    ),
    judgeRelevance(
      run.product,
      run.goal,
      run.region,
      "creator",
      captions.map((c) => ({ platform: c.platform, handle: c.handle, text: c.text || "(no captions stored)", views: null })),
      { brief: run.brief },
    ),
  ]);
  if (!clipLabels && !creatorLabels) return { ok: false as const, judged: 0, partial: true };

  // Which judge gave the label, so labels from different judges are never mixed up.
  const model = `${modelName()} · judge ${JUDGE_VERSION}`;
  const rows = [
    ...(clipLabels ?? []).map((l) => ({ item: String(clipList[l.i].id), kind: "clip", platform: clipList[l.i].platform, label: l.label, reason: l.reason })),
    ...(creatorLabels ?? []).map((l) => ({
      item: creatorItem(captions[l.i].platform, captions[l.i].handle),
      kind: "creator",
      platform: captions[l.i].platform,
      label: l.label,
      reason: l.reason,
    })),
  ].map((r) => ({ ...r, run_id: run.id, source: "ai", model, reason: r.reason.slice(0, 300), judged_at: new Date().toISOString() }));
  const { error } = rows.length ? await admin.from("relevance_labels").upsert(rows, { onConflict: "run_id,item,source" }) : { error: null };
  return { ok: !error, judged: rows.length, partial: !clipLabels || !creatorLabels };
}

/**
 * Gets one brief ready for replay (AI only, never credits): results stored before the search kept its relevance score
 * get one from a fresh relevance check, then the clips and creators any order variant puts in the judged places are
 * judged if nobody has yet. A brief with nothing missing makes no AI call.
 */
export async function prepareReplayAction(id: string) {
  const admin = await ownerAdmin();
  const parsed = runId.safeParse(id);
  if (!admin || !parsed.success) return { ok: false as const };
  const brief = await loadEvalBrief(admin, parsed.data);
  if (!brief) return { ok: false as const };
  const { run, videos, feedback, labels } = brief;
  const { unscored } = replayGaps(videos, run.goal, feedback, labels);
  if (unscored.length) {
    const rated = await rateRelevance(run.product, unscored, run.goal, feedback?.examples);
    if (!rated) return { ok: false as const };
    for (const score of [0, 1, 2]) {
      const ids = unscored.filter((_, i) => rated.scores[i] === score).map((v) => v.dbId!);
      if (ids.length) await admin.from("run_results").update({ relevance: score }).eq("run_id", run.id).in("video_id", ids);
    }
    unscored.forEach((v, i) => (v.relevance = rated.scores[i]));
  }
  // With every score in place, the variants' orders are final: judge what they surface.
  const gaps = replayGaps(videos, run.goal, feedback, labels);
  const res = await judgeItems(admin, brief, gaps.clips, gaps.creators);
  return { ...res, scored: unscored.length };
}

/**
 * Tries a judge version on some of one brief's clips (the judge check's sample) and returns its labels WITHOUT storing
 * them, so a new judge is compared with the owner's blind labels before it replaces anything. AI only, no credits.
 */
export async function trialJudgeAction(id: string, items: string[], version: string) {
  const admin = await ownerAdmin();
  const parsed = z
    .object({ id: runId, items: z.array(z.string().regex(/^\d+$/).max(20)).min(1).max(40), version: z.enum(JUDGE_VERSIONS) })
    .safeParse({ id, items, version });
  if (!admin || !parsed.success) return { ok: false as const };
  const brief = await loadEvalBrief(admin, parsed.data.id);
  if (!brief) return { ok: false as const };
  const byId = new Map(brief.videos.map((v) => [String(v.dbId), v]));
  const list = parsed.data.items.filter((i) => byId.has(i));
  const labels = await judgeRelevance(
    brief.run.product,
    brief.run.goal,
    brief.run.region,
    "clip",
    list.map((i) => {
      const v = byId.get(i)!;
      return { platform: v.platform, handle: v.creatorHandle, text: v.caption || "(no caption)", views: v.views };
    }),
    { brief: brief.run.brief, version: parsed.data.version },
  );
  if (!labels) return { ok: false as const };
  return { ok: true as const, labels: labels.map((l) => ({ item: list[l.i], label: l.label, reason: l.reason.slice(0, 300) })) };
}

/**
 * Tries a relevance-check version on some of one brief's labelled clips and returns its scores WITHOUT storing them,
 * so a new check is compared with the owner's labels before the search uses it. AI only, no credits.
 */
export async function trialRelevanceAction(id: string, items: string[], version: string, calibration: unknown, votes?: unknown, covers = false) {
  const admin = await ownerAdmin();
  const parsed = z
    .object({
      id: runId,
      items: z.array(z.string().regex(/^\d+$/).max(20)).min(1).max(120),
      version: z.enum(RELEVANCE_VERSIONS),
      calibration: z
        .array(z.object({ product: z.string().max(100), caption: z.string().max(200), label: z.union([z.literal(0), z.literal(1), z.literal(2)]) }))
        .max(15),
      // Stand-in 👍/👎 for the product (the learning-from-votes trial); null keeps the product's own.
      votes: z
        .object({
          liked: z.array(z.object({ handle: z.string().max(100), caption: z.string().max(200) })).max(8),
          disliked: z.array(z.object({ handle: z.string().max(100), caption: z.string().max(200) })).max(8),
        })
        .nullable(),
    })
    .safeParse({ id, items, version, calibration, votes: votes ?? null });
  const withCovers = covers === true;
  if (!admin || !parsed.success) return { ok: false as const };
  const brief = await loadEvalBrief(admin, parsed.data.id);
  if (!brief) return { ok: false as const };
  const byId = new Map(brief.videos.map((v) => [String(v.dbId), v]));
  const list = parsed.data.items.filter((i) => byId.has(i));
  const v = parsed.data.votes;
  const asVoted = (side: { handle: string; caption: string }[], vote: 1 | -1) =>
    side.map((c) => ({ platform: "tiktok", platformVideoId: "", creatorHandle: c.handle, caption: c.caption, vote }));
  const examples = v ? { liked: asVoted(v.liked, 1), disliked: asVoted(v.disliked, -1) } : brief.feedback?.examples;
  const rated = await rateRelevance(brief.run.product, list.map((i) => byId.get(i)!), brief.run.goal, examples, {
    version: parsed.data.version,
    brief: brief.run.brief,
    calibration: parsed.data.calibration,
    covers: withCovers,
    // Trials compare prompts: one model, no fallback, so no batch is answered by a different model.
    singleModel: true,
  });
  if (!rated) return { ok: false as const };
  return { ok: true as const, scores: list.map((item, i) => ({ item, score: rated.scores[i] })) };
}

/** A label the owner gave without seeing the AI judge's (the judge check). It also corrects the brief's metrics. */
export async function setBlindLabelAction(id: string, item: string, platform: string, label: number) {
  const admin = await ownerAdmin();
  const parsed = z
    .object({ id: runId, item: z.string().regex(/^\d+$/).max(20), platform: z.enum(EVAL_PLATFORMS), label: z.union([z.literal(0), z.literal(1), z.literal(2)]) })
    .safeParse({ id, item, platform, label });
  if (!admin || !parsed.success) return { ok: false as const };
  const d = parsed.data;
  const { error } = await admin
    .from("relevance_labels")
    .upsert(
      { run_id: d.id, item: d.item, kind: "clip", platform: d.platform, label: d.label, source: "user", blind: true, judged_at: new Date().toISOString() },
      { onConflict: "run_id,item,source" },
    );
  revalidatePath("/[locale]/app/eval", "layout");
  return { ok: !error };
}

/** The researches of one brief (the original and its re-runs) whose results contain this clip. */
async function familyRunsWith(admin: Admin, family: string, item: string) {
  const { data: runs } = await admin.from("eval_briefs").select("run_id").or(`run_id.eq.${family},parent_run_id.eq.${family}`);
  const ids = (runs ?? []).map((r) => r.run_id as string);
  if (!ids.length) return [];
  const { data } = await admin.from("run_results").select("run_id").in("run_id", ids).eq("video_id", Number(item));
  return [...new Set((data ?? []).map((r) => r.run_id as string))];
}

const queueInput = z.object({ family: runId, item: z.string().regex(/^\d+$/).max(20) });
const labelValue = z.union([z.literal(0), z.literal(1), z.literal(2)]);

/**
 * A label from the labelling queue: one answer per clip per brief, stored (blind, as the owner's) on every research of
 * that brief that contains the clip, so re-runs of the same brief never ask again.
 */
export async function labelClipAction(family: string, item: string, platform: string, label: number) {
  const admin = await ownerAdmin();
  const parsed = queueInput.extend({ platform: z.enum(EVAL_PLATFORMS), label: labelValue }).safeParse({ family, item, platform, label });
  if (!admin || !parsed.success) return { ok: false as const };
  const d = parsed.data;
  const runs = await familyRunsWith(admin, d.family, d.item);
  if (!runs.length) return { ok: false as const };
  const at = new Date().toISOString();
  const { error } = await admin
    .from("relevance_labels")
    .upsert(
      runs.map((run_id) => ({ run_id, item: d.item, kind: "clip", platform: d.platform, label: d.label, source: "user", blind: true, judged_at: at })),
      { onConflict: "run_id,item,source" },
    );
  return { ok: !error };
}

/** Takes back the last queue answer (all researches of the brief). */
export async function undoClipAction(family: string, item: string) {
  const admin = await ownerAdmin();
  const parsed = queueInput.safeParse({ family, item });
  if (!admin || !parsed.success) return { ok: false as const };
  const runs = await familyRunsWith(admin, parsed.data.family, parsed.data.item);
  if (!runs.length) return { ok: true as const };
  const { error } = await admin.from("relevance_labels").delete().in("run_id", runs).eq("item", parsed.data.item).eq("source", "user").eq("blind", true);
  return { ok: !error };
}

/** The second, unmarked answer on a clip labelled earlier (null takes it back): how consistent the labels are. */
export async function repeatClipAction(family: string, item: string, label: number | null) {
  const admin = await ownerAdmin();
  const parsed = queueInput.extend({ label: labelValue.nullable() }).safeParse({ family, item, label });
  if (!admin || !parsed.success) return { ok: false as const };
  const runs = await familyRunsWith(admin, parsed.data.family, parsed.data.item);
  if (!runs.length) return { ok: false as const };
  const { error } = await admin
    .from("relevance_labels")
    .update({ repeat_label: parsed.data.label, repeat_at: parsed.data.label === null ? null : new Date().toISOString() })
    .in("run_id", runs)
    .eq("item", parsed.data.item)
    .eq("source", "user");
  return { ok: !error };
}

/** Hold-out briefs are measured with every search change but never tuned on. */
export async function setHoldoutAction(id: string, holdout: boolean) {
  const admin = await ownerAdmin();
  const parsed = runId.safeParse(id);
  if (!admin || !parsed.success) return { ok: false as const };
  const { error } = await admin.from("eval_briefs").update({ holdout }).eq("run_id", parsed.data);
  refresh();
  return { ok: !error };
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

/** Adds several researches at once (the suggested starting set is added as core briefs; hold-out briefs are measured, never tuned on). */
export async function addBriefsAction(ids: string[], core: boolean, holdout = false) {
  const admin = await ownerAdmin();
  const parsed = z.array(runId).max(50).safeParse(ids);
  if (!admin || !parsed.success) return { ok: false as const };
  const { error } = await admin
    .from("eval_briefs")
    .upsert(parsed.data.map((run_id) => ({ run_id, core: core && !holdout, holdout: holdout === true })), { onConflict: "run_id" });
  refresh();
  return { ok: !error };
}

type RunInputRow = { text?: string; url?: string | null; productName?: string; whatItIs?: string; audience?: string; reply?: string; competitors?: string[] };

/** A test brief's research, as a re-run or a new keyword plan needs it. */
async function briefRun(admin: Admin, id: string) {
  const { data: run } = await admin
    .from("research_runs")
    .select("id, brief, keywords, keyword_regions, keyword_english, exclusions, platforms, region, goal, settings, input, product_id")
    .eq("id", id)
    .maybeSingle();
  return run && isGoal(run.goal) ? { ...run, goal: run.goal, input: (run.input ?? {}) as RunInputRow } : null;
}

/**
 * Plans a brief's keywords again with the keyword planner on trial (v2, search quality S4), from what the founder
 * gave the original research: their words, link, region, goal and saved product. One AI call, no credits. Null when
 * the AI is unavailable (the sample plan is no test of the planner).
 */
async function replan(admin: Admin, run: NonNullable<Awaited<ReturnType<typeof briefRun>>>, lang: "th" | "en") {
  const { data: saved } = run.product_id
    ? await admin.from("products").select("name, url, description, audience, competitors").eq("id", run.product_id).maybeSingle()
    : { data: null };
  const url = run.input.url ?? "";
  const plan = await understandProduct(
    {
      text: (run.input.text ?? run.brief ?? "").slice(0, 1000),
      link: url ? await readLink(url) : null,
      image: null,
      region: (run.region as "th" | "global" | "both") ?? "th",
      saved,
      goal: run.goal,
      english: false,
    },
    lang,
    undefined,
    { planner: "v2" },
  ).catch(() => null);
  return plan?.source === "ai" ? plan : null;
}

/** The new keyword plan (v2) for a test brief, for the free preview on the keyword scorecard. */
export async function previewPlanAction(id: string, lang: string) {
  const admin = await ownerAdmin();
  const parsed = z.object({ id: runId, lang: z.enum(["th", "en"]) }).safeParse({ id, lang });
  if (!admin || !parsed.success) return { ok: false as const };
  const run = await briefRun(admin, parsed.data.id);
  const plan = run ? await replan(admin, run, parsed.data.lang) : null;
  if (!plan) return { ok: false as const };
  return { ok: true as const, keywords: plan.keywords.map((k) => k.text), competitors: plan.competitors };
}

/**
 * Re-runs a test brief with the same product, goal, region, platforms, settings and KEYWORDS (so the comparison is the
 * search, not the keyword planner) and adds the new research to the set, linked to the original. Spends credits like
 * any research (~30-40), so the page asks first. With `replanKeywords` (search quality S4): new keywords from planner
 * v2, TikTok + YouTube only (Instagram is creator-first, so keywords matter least there, and it costs the most), and
 * the research is marked `settings.planner = "v2"`.
 */
export async function rerunBriefAction(id: string, lang: string, replanKeywords = false) {
  const admin = await ownerAdmin();
  const parsed = z.object({ id: runId, lang: z.enum(["th", "en"]), replan: z.boolean() }).safeParse({ id, lang, replan: replanKeywords });
  if (!admin || !parsed.success) return { ok: false as const, error: "invalid" as const };
  const run = await briefRun(admin, parsed.data.id);
  if (!run) return { ok: false as const, error: "noGoal" as const };
  const input = run.input;
  const plan = parsed.data.replan ? await replan(admin, run, parsed.data.lang) : null;
  if (parsed.data.replan && !plan) return { ok: false as const, error: "noPlan" as const };
  const keywords = plan
    ? plan.keywords.map((k) => ({ text: k.text.slice(0, 80), region: k.region }))
    : ((run.keywords as string[]) ?? []).map((text, i) => ({
        text,
        region: (((run.keyword_regions as string[] | null) ?? [])[i] === "global" ? "global" : "th") as "th" | "global",
        english: ((run.keyword_english as string[] | null) ?? [])[i] || undefined,
      }));
  const original = (run.platforms as ("tiktok" | "youtube" | "instagram")[]) ?? ["tiktok", "youtube"];
  const kept = plan ? original.filter((p) => p !== "instagram") : original;
  const platforms = kept.length ? kept : (["tiktok", "youtube"] as const);
  const settings = (run.settings ?? {}) as { days?: number; minViews?: number; language?: string };
  // Linked the moment the research row exists, so the link survives a run that outlasts this page's time limit.
  const link = async (newId: string) => {
    await admin.from("eval_briefs").upsert({ run_id: newId, parent_run_id: parsed.data.id, core: false }, { onConflict: "run_id" });
    if (!plan) return;
    const { data: row } = await admin.from("research_runs").select("settings").eq("id", newId).maybeSingle();
    await admin.from("research_runs").update({ settings: { ...((row?.settings ?? {}) as object), planner: "v2" } }).eq("id", newId);
  };
  const res = await startResearch({
    requestId: crypto.randomUUID(),
    text: (input.text ?? run.brief ?? "").slice(0, 1000),
    url: input.url ?? "",
    imageThumb: null,
    understanding: {
      productName: (input.productName || "Product").slice(0, 80),
      whatItIs: (input.whatItIs ?? "").slice(0, 300),
      audience: (input.audience ?? "").slice(0, 200),
      reply: (input.reply ?? "").slice(0, 400),
      competitors: (plan?.competitors.length ? plan.competitors : (input.competitors ?? [])).slice(0, 6),
    },
    keywords,
    exclusions: (run.exclusions as string[]) ?? [],
    platforms: [...platforms],
    region: (run.region as "th" | "global" | "both") ?? "th",
    goal: run.goal,
    settings: {
      days: ([7, 30, 90].includes(settings.days ?? 90) ? settings.days : 90) as 7 | 30 | 90,
      minViews: settings.minViews ?? 10_000,
      language: (["any", "th", "en"].includes(settings.language ?? "any") ? settings.language : "any") as "any" | "th" | "en",
    },
    productId: (run.product_id as string | null) ?? null,
    locale: parsed.data.lang,
  }, link).catch((e: Error) => {
    console.error("[eval] re-run failed", e.message);
    return null;
  });
  if (!res?.runId) return { ok: false as const, error: (res && "error" in res ? res.error : "failed") as string };
  refresh();
  return { ok: true as const, runId: res.runId };
}
