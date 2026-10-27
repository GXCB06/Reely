"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { MAX_KEYWORDS, type RunSummary } from "@/lib/ai/schemas";
import { answerFollowUp, englishKeywords, enhanceBrief, ideasForClips, type ProductBrief, rateRelevance, summarizeRun } from "@/lib/ai/tasks";
import { type ResultRow, videoFromResultRow } from "@/lib/db-mappers";
import { type Feedback, withFeedback } from "@/lib/feedback";
import { loadFeedback } from "@/lib/feedback-store";
import { GOALS, type Goal, isGoal, scoreFor } from "@/lib/goals";
import { diverseTop, relevanceKeep } from "@/lib/results";
import { looksThai } from "@/lib/region";
import { engagementRate, keepRate } from "@/lib/scoring";
import { type PlatformStats, type ScoredVideo, searchKeywords } from "@/lib/search";
import { DEFAULT_MIN_VIEWS } from "@/lib/search-settings";
import { researchesLeft } from "@/lib/limits";
import { createClient } from "@/lib/supabase/server";
import { persistThumbnails } from "@/lib/thumbs";

const MAX_PRODUCTS = 5;
/** A research can pull in new videos at most about once a day (credits). */
const REFRESH_COOLDOWN_MS = 20 * 3600e3;

const regionChoice = z.enum(["th", "global", "both"]);
const locale = z.enum(["th", "en"]);
const productId = z.string().uuid().nullable();
const goalChoice = z.enum(GOALS);
const settingsSchema = z.object({
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  minViews: z.number().int().min(0).max(10_000_000),
  language: z.enum(["any", "th", "en"]).default("any"),
});
// A resized JPEG/PNG/WebP from the composer (~100-300 KB as base64).
const imageDataUrl = z
  .string()
  .max(1_400_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);
const thumbDataUrl = imageDataUrl.max(60_000);

/** Chat "Enhance": sharpens a rough line into a brief and says which of the 4 parts it covers. */
export async function enhanceBriefAction(text: string, lang: string) {
  const parsed = z.object({ text: z.string().trim().min(3).max(1000), lang: locale }).safeParse({ text, lang });
  if (!parsed.success) return { ok: false as const };
  const enhanced = await enhanceBrief(parsed.data.text, parsed.data.lang);
  return enhanced ? { ok: true as const, ...enhanced } : { ok: false as const };
}

const runSchema = z.object({
  text: z.string().trim().max(1000),
  url: z.union([z.literal(""), z.string().trim().max(300)]),
  imageThumb: thumbDataUrl.nullable(),
  understanding: z.object({
    productName: z.string().trim().min(1).max(80),
    whatItIs: z.string().trim().max(300),
    audience: z.string().trim().max(200),
    reply: z.string().trim().max(400),
    competitors: z.array(z.string().trim().min(1).max(40)).max(6).default([]),
  }),
  keywords: z
    .array(
      z.object({
        text: z.string().trim().min(2).max(80),
        region: z.enum(["th", "global"]),
        english: z.string().trim().max(80).optional(),
      }),
    )
    .min(1)
    .max(MAX_KEYWORDS),
  exclusions: z.array(z.string().trim().min(1).max(40)).max(10),
  platforms: z.array(z.enum(["tiktok", "youtube", "instagram"])).min(1),
  region: regionChoice,
  goal: goalChoice,
  settings: settingsSchema,
  productId,
  locale,
});

export type RunInput = z.infer<typeof runSchema>;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The run's product: the chosen one, one with the same name, or a new one (up to 5) so it is remembered. */
async function resolveProduct(supabase: Supabase, input: RunInput): Promise<string | null> {
  const { productName, whatItIs, audience, competitors } = input.understanding;
  if (input.productId) {
    // Remember competitors the AI found for a saved product that had none yet.
    if (competitors.length) {
      await supabase.from("products").update({ competitors }).eq("id", input.productId).is("competitors", null);
    }
    // The goal the user just confirmed is what this product is for from now on (asked once).
    await supabase.from("products").update({ goal: input.goal }).eq("id", input.productId);
    return input.productId;
  }
  const { data: products } = await supabase.from("products").select("id, name");
  const same = products?.find((p) => (p.name as string).trim().toLowerCase() === productName.trim().toLowerCase());
  if (same) {
    await supabase.from("products").update({ goal: input.goal }).eq("id", same.id);
    return same.id as string;
  }
  if ((products?.length ?? 0) >= MAX_PRODUCTS) return null;
  const { data } = await supabase
    .from("products")
    .insert({
      name: productName,
      url: input.url ? (/^https?:\/\//i.test(input.url) ? input.url : `https://${input.url}`) : null,
      description: whatItIs || null,
      audience: audience || null,
      competitors: competitors.length ? competitors : null,
      language: input.locale,
      goal: input.goal,
    })
    .select("id")
    .single();
  return (data?.id as string | undefined) ?? null;
}

const resultRow = (runId: string, v: ScoredVideo, rank: number) => ({
  run_id: runId,
  video_id: v.dbId!,
  keyword: v.keyword,
  reach_score: v.reach,
  usual_score: v.usual,
  usual_views: v.usualViews === null ? null : Math.round(v.usualViews),
  label: v.label,
  rank,
  copyable: v.copyable ?? null,
});

/** Creates a research run, searches, saves ranked results and the AI insight card. Returns the run id. */
export async function runResearchAction(input: RunInput) {
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const { text, url, imageThumb, understanding, exclusions, platforms, region, goal, settings, locale } = parsed.data;
  let { keywords } = parsed.data;
  // Plans only include English versions when Reels was on; if Reels was turned on afterwards (or a keyword was
  // added by hand), translate the Thai ones now (Instagram's search only understands English).
  if (platforms.includes("instagram") && keywords.some((k) => !k.english && looksThai(k.text))) {
    const english = await englishKeywords(keywords.map((k) => k.text));
    if (english) keywords = keywords.map((k, i) => ({ ...k, english: k.english || english[i] }));
  }
  const brief = (text || `${understanding.productName}: ${understanding.whatItIs}`).slice(0, 1000);

  const supabase = await createClient();
  if ((await researchesLeft(supabase)) === 0) return { ok: false as const, error: "limit" };
  const productRowId = await resolveProduct(supabase, parsed.data);
  const { data: run, error: runError } = await supabase
    .from("research_runs")
    .insert({
      brief,
      title: understanding.productName,
      product_id: productRowId,
      keywords: keywords.map((k) => k.text),
      keyword_regions: keywords.map((k) => k.region),
      keyword_english: keywords.map((k) => k.english || k.text),
      exclusions,
      platforms,
      region,
      goal,
      settings,
      input: { text, url: url || null, imageThumb, ...understanding },
      status: "running",
    })
    .select("id")
    .single();
  if (runError || !run) return { ok: false as const, error: "save" };

  try {
    const product = {
      name: understanding.productName,
      whatItIs: understanding.whatItIs,
      audience: understanding.audience,
      competitors: understanding.competitors,
    };
    // What the user taught Reely about this product (👍/👎 on earlier researches).
    const { feedback } = await loadFeedback(supabase, productRowId);
    const result = await searchKeywords(keywords, platforms, exclusions, { product, goal, feedback, ...settings });
    const rows = result.videos.filter((v) => v.dbId !== undefined).map((v, i) => resultRow(run.id, v, i + 1));
    after(() => persistThumbnails(result.videos));
    if (rows.length) {
      const { error } = await supabase.from("run_results").insert(rows);
      if (error) throw new Error(error.message);
    }

    // Results are saved: mark the run done now, so a slow or failed AI summary never blocks them.
    await supabase
      .from("research_runs")
      .update({
        status: "done",
        error: result.errors.length ? result.errors.join("\n").slice(0, 2000) : null,
        stats: {
          hidden: result.hidden,
          offTopic: result.offTopic,
          platforms: result.platforms,
          feedback: feedback ? { liked: feedback.liked.size, disliked: feedback.disliked.size } : undefined,
          relevanceFailed: result.relevanceFailed || undefined,
          similarAccounts: result.similarAccounts.length ? result.similarAccounts : undefined,
        },
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    // The "your idea" lines are written after the results are on screen (writeIdeasAction), so they never slow a run.
    const summary = await summaryFor(result.videos, keywords.map((k) => k.text), product, goal, feedback, locale);
    await supabase.from("research_runs").update({ summary }).eq("id", run.id);
    revalidatePath("/[locale]/app", "layout");
    return { ok: true as const, runId: run.id as string };
  } catch (e) {
    await supabase
      .from("research_runs")
      .update({ status: "failed", error: (e as Error).message.slice(0, 2000), finished_at: new Date().toISOString() })
      .eq("id", run.id);
    revalidatePath("/[locale]/app", "layout");
    return { ok: false as const, error: "search", runId: run.id as string };
  }
}

const runId = z.string().uuid();

/** The AI summary and formulas for a research's results; the 10 the page shows first lead the list (up to 15). */
async function summaryFor(
  videos: ScoredVideo[],
  keywords: string[],
  product: ProductBrief,
  goal: Goal | null,
  feedback: Feedback | null,
  locale: "th" | "en",
) {
  const top10 = diverseTop(videos, 10, 2, withFeedback<ScoredVideo>(scoreFor(goal), feedback));
  const top = [...top10, ...videos.filter((v) => !top10.includes(v))].slice(0, 15);
  return summarizeRun(
    {
      keywords,
      totalVideos: videos.length,
      topViews: videos.reduce<number | null>((m, v) => Math.max(m ?? 0, v.views ?? 0), null),
      smallAccountsInTop10: top.slice(0, 10).filter((v) => (v.creatorFollowers ?? Infinity) < 10_000).length,
      breakouts: videos.filter((v) => v.label === "breakout").length,
      product,
      goal,
      top: top.map((v) => ({
        dbId: v.dbId,
        keepRate: keepRate(v),
        handle: v.creatorHandle,
        caption: v.caption,
        views: v.views,
        multiplier: v.usual ?? v.reach,
        platform: v.platform,
      })),
    },
    locale,
  );
}

type RunStats = {
  hidden?: number;
  offTopic?: number;
  platforms?: Partial<Record<ScoredVideo["platform"], PlatformStats>>;
  feedback?: { liked: number; disliked: number };
  relevanceFailed?: boolean;
};

/**
 * When Gemini was too busy to check relevance, a research keeps everything it found. This re-checks the saved
 * results (AI only, no credits), drops the off-topic ones, rewrites the summary, and the page then writes new
 * idea lines.
 */
export async function recheckRelevanceAction(id: string, lang: string) {
  const parsed = z.object({ id: runId, lang: locale }).safeParse({ id, lang });
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const supabase = await createClient();
  const [{ data: run }, { data: rows }] = await Promise.all([
    supabase.from("research_runs").select("id, keywords, goal, input, stats, product_id").eq("id", parsed.data.id).maybeSingle(),
    supabase
      .from("run_results")
      .select("keyword, reach_score, usual_score, usual_views, label, copyable, videos(*)")
      .eq("run_id", parsed.data.id)
      .order("rank"),
  ]);
  const input = (run?.input ?? {}) as { productName?: string; whatItIs?: string; audience?: string };
  if (!run || !input.productName) return { ok: false as const, error: "invalid" as const };
  const all = ((rows ?? []) as unknown as ResultRow[]).map(videoFromResultRow).filter((v): v is ScoredVideo => v !== null && v.dbId !== undefined);
  const goal = isGoal(run.goal) ? run.goal : null;
  const product = { name: input.productName, whatItIs: input.whatItIs ?? "", audience: input.audience ?? "" };
  const { feedback } = await loadFeedback(supabase, run.product_id as string | null);

  const rated = await rateRelevance(product, all, goal, feedback?.examples);
  if (!rated) return { ok: false as const, error: "busy" as const };
  const keep = relevanceKeep(rated.scores);
  const kept = all.filter((_, i) => keep[i]);
  const dropped = all.filter((_, i) => !keep[i]);

  if (dropped.length) {
    await supabase.from("run_results").delete().eq("run_id", run.id).in("video_id", dropped.map((v) => v.dbId!));
  }
  // Store the copy ratings the check also gave (one update per rating).
  for (const copy of [0, 1, 2]) {
    const ids = all.filter((v, i) => keep[i] && rated.copy[i] === copy).map((v) => v.dbId!);
    if (ids.length) await supabase.from("run_results").update({ copyable: copy }).eq("run_id", run.id).in("video_id", ids);
  }
  const keptWithCopy = kept.map((v) => ({ ...v, copyable: rated.copy[all.indexOf(v)] ?? null }));

  const stats = (run.stats ?? {}) as RunStats;
  const platforms = structuredClone(stats.platforms ?? {});
  for (const v of dropped) {
    const p = (platforms[v.platform] ??= { found: 0, kept: 0, dropped: {} });
    p.kept = Math.max(0, p.kept - 1);
    p.dropped.offTopic = (p.dropped.offTopic ?? 0) + 1;
  }
  // A new summary from the clean list; without idea lines, so the page writes fresh ones for the new top 10.
  const summary = await summaryFor(keptWithCopy, run.keywords as string[], product, goal, feedback, parsed.data.lang);
  await supabase
    .from("research_runs")
    .update({
      stats: { ...stats, platforms, offTopic: (stats.offTopic ?? 0) + dropped.length, relevanceFailed: false },
      summary,
    })
    .eq("id", run.id);
  revalidatePath("/[locale]/app/research/[id]", "page");
  return { ok: true as const, dropped: dropped.length };
}

/**
 * Results page, right after it shows: writes the "your idea" line for the 10 clips it shows first (one AI call,
 * no credits) and stores them with the summary. Does nothing when they are already there.
 */
export async function writeIdeasAction(id: string, lang: string) {
  const parsed = z.object({ id: runId, lang: locale }).safeParse({ id, lang });
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const [{ data: run }, { data: rows }] = await Promise.all([
    supabase.from("research_runs").select("id, goal, input, summary, product_id").eq("id", parsed.data.id).maybeSingle(),
    supabase
      .from("run_results")
      .select("keyword, reach_score, usual_score, usual_views, label, copyable, videos(*)")
      .eq("run_id", parsed.data.id)
      .order("rank"),
  ]);
  const summary = run?.summary as RunSummary | null;
  const input = (run?.input ?? {}) as { productName?: string; whatItIs?: string; audience?: string };
  if (!run || !summary || !isGoal(run.goal) || !input.productName) return { ok: false as const };
  if (summary.ideas?.length) return { ok: true as const };

  // The same 10 the page shows first.
  const all = ((rows ?? []) as unknown as ResultRow[]).map(videoFromResultRow).filter((v): v is ScoredVideo => v !== null);
  const { feedback } = await loadFeedback(supabase, run.product_id as string | null);
  const top10 = diverseTop(all, 10, 2, withFeedback<ScoredVideo>(scoreFor(run.goal), feedback));
  const ideas = await ideasForClips(
    { name: input.productName, whatItIs: input.whatItIs ?? "", audience: input.audience ?? "" },
    run.goal,
    top10.map((v) => ({
      handle: v.creatorHandle,
      caption: v.caption,
      views: v.views,
      multiplier: v.usual ?? v.reach,
      hasShop: Boolean(v.hasShop),
      platform: v.platform,
    })),
    parsed.data.lang,
  );
  if (!ideas) return { ok: false as const };
  const list = ideas
    .map((idea, i) => ({ videoId: top10[i]?.dbId, idea }))
    .filter((x): x is { videoId: number; idea: string } => x.videoId !== undefined && !!x.idea);
  await supabase.from("research_runs").update({ summary: { ...summary, ideas: list } }).eq("id", run.id);
  revalidatePath("/[locale]/app/research/[id]", "page");
  return { ok: true as const };
}

/**
 * "Update with new videos": re-runs the same search for the time since the last update (7, 30 or 90 days),
 * adds only videos the research does not have yet (they show as new), at most about once a day.
 */
export async function refreshRunAction(id: string) {
  const parsed = runId.safeParse(id);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const supabase = await createClient();
  const { data: run } = await supabase
    .from("research_runs")
    .select("id, keywords, keyword_regions, keyword_english, exclusions, platforms, settings, input, goal, product_id, stats, created_at, last_refreshed_at, status")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!run || run.status === "running") return { ok: false as const, error: "invalid" as const };
  const lastAt = new Date((run.last_refreshed_at as string | null) ?? (run.created_at as string)).getTime();
  if (Date.now() - lastAt < REFRESH_COOLDOWN_MS) return { ok: false as const, error: "tooSoon" as const };

  const sinceDays = (Date.now() - lastAt) / 864e5;
  const days = sinceDays <= 7 ? 7 : sinceDays <= 30 ? 30 : 90;
  const settings = (run.settings as { minViews?: number; language?: "any" | "th" | "en" } | null) ?? {};
  const input = (run.input ?? {}) as { productName?: string; whatItIs?: string; audience?: string; competitors?: string[] };
  const regions = (run.keyword_regions as ("th" | "global")[] | null) ?? [];
  const english = (run.keyword_english as string[] | null) ?? [];
  const keywords = (run.keywords as string[]).map((text, i) => ({
    text,
    region: regions[i] ?? ("th" as const),
    english: english[i],
  }));
  const product = input.productName
    ? { name: input.productName, whatItIs: input.whatItIs ?? "", audience: input.audience ?? "", competitors: input.competitors }
    : undefined;

  const result = await searchKeywords(
    keywords,
    run.platforms as ("tiktok" | "youtube" | "instagram")[],
    (run.exclusions as string[]) ?? [],
    {
      product,
      goal: isGoal(run.goal) ? (run.goal as Goal) : null,
      feedback: (await loadFeedback(supabase, run.product_id as string | null)).feedback,
      days,
      minViews: settings.minViews ?? DEFAULT_MIN_VIEWS,
      language: settings.language,
    },
  );
  const { data: existing } = await supabase.from("run_results").select("video_id, rank").eq("run_id", run.id);
  const have = new Set((existing ?? []).map((r) => r.video_id as number));
  const maxRank = Math.max(0, ...(existing ?? []).map((r) => (r.rank as number | null) ?? 0));
  const fresh = result.videos.filter((v) => v.dbId !== undefined && !have.has(v.dbId));
  after(() => persistThumbnails(fresh));
  if (fresh.length) {
    const { error } = await supabase.from("run_results").insert(fresh.map((v, i) => resultRow(run.id, v, maxRank + i + 1)));
    if (error) return { ok: false as const, error: "failed" as const };
  }
  await supabase
    .from("research_runs")
    .update({
      last_refreshed_at: new Date().toISOString(),
      // New videos that skipped the relevance check (Gemini busy) bring back the re-check banner.
      ...(result.relevanceFailed && fresh.length ? { stats: { ...((run.stats ?? {}) as RunStats), relevanceFailed: true } } : {}),
    })
    .eq("id", run.id);
  revalidatePath("/[locale]/app", "layout");
  return { ok: true as const, added: fresh.length };
}

/** Sidebar chat menu: rename a research chat. */
export async function renameRunAction(id: string, title: string) {
  const parsed = z.object({ id: runId, title: z.string().trim().min(1).max(80) }).safeParse({ id, title });
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const { error } = await supabase.from("research_runs").update({ title: parsed.data.title }).eq("id", parsed.data.id);
  revalidatePath("/[locale]/app", "layout");
  return { ok: !error };
}

/** Sidebar chat menu: pin to the top of Recent, or unpin. */
export async function pinRunAction(id: string, pinned: boolean) {
  const parsed = z.object({ id: runId, pinned: z.boolean() }).safeParse({ id, pinned });
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const { error } = await supabase
    .from("research_runs")
    .update({ pinned_at: parsed.data.pinned ? new Date().toISOString() : null })
    .eq("id", parsed.data.id);
  revalidatePath("/[locale]/app", "layout");
  return { ok: !error };
}

/** Sidebar chat menu: delete a research chat and its results (videos stay in the shared cache). */
export async function deleteRunAction(id: string) {
  const parsed = runId.safeParse(id);
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const { error } = await supabase.from("research_runs").delete().eq("id", parsed.data);
  revalidatePath("/[locale]/app", "layout");
  return { ok: !error };
}

/** Followed topics feed the Today page (re-searched for the last 7 days). Kept to 2 to cap daily credits. */
const MAX_FOLLOWED_TOPICS = 2;

export async function followRunAction(id: string, follow: boolean) {
  const parsed = z.object({ id: runId, follow: z.boolean() }).safeParse({ id, follow });
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const supabase = await createClient();
  if (parsed.data.follow) {
    const { count } = await supabase
      .from("research_runs")
      .select("id", { count: "exact", head: true })
      .not("followed_at", "is", null)
      .neq("id", parsed.data.id);
    if ((count ?? 0) >= MAX_FOLLOWED_TOPICS) return { ok: false as const, error: "limit" };
  }
  const { error } = await supabase
    .from("research_runs")
    .update({ followed_at: parsed.data.follow ? new Date().toISOString() : null })
    .eq("id", parsed.data.id);
  revalidatePath("/[locale]/app", "layout");
  return error ? { ok: false as const, error: "failed" } : { ok: true as const };
}

export type FollowUpReply = {
  reply: string;
  clips: { dbId: number; handle: string; thumbnailUrl: string | null; views: number | null; multiplier: number | null }[];
  /** A new search the user can start (the chat, pre-filled), when they asked for videos this research doesn't have. */
  researchHref: string | null;
};

/** "Ask Reely" under a research: answers from its clips, or proposes a new search. One Gemini call, no credits. */
export async function followUpAction(id: string, question: string, lang: string) {
  const parsed = z.object({ id: runId, question: z.string().trim().min(2).max(500), lang: locale }).safeParse({ id, question, lang });
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const [{ data: run }, { data: rows }] = await Promise.all([
    supabase.from("research_runs").select("id, goal, input, brief, region, product_id").eq("id", parsed.data.id).maybeSingle(),
    supabase
      .from("run_results")
      .select("keyword, reach_score, usual_score, usual_views, label, copyable, videos(*)")
      .eq("run_id", parsed.data.id)
      .order("rank"),
  ]);
  if (!run) return { ok: false as const };
  const input = (run.input ?? {}) as { productName?: string; whatItIs?: string; audience?: string };
  const goal = isGoal(run.goal) ? (run.goal as Goal) : null;
  const all = ((rows ?? []) as unknown as ResultRow[]).map(videoFromResultRow).filter((v): v is ScoredVideo => v !== null);
  const { feedback } = await loadFeedback(supabase, run.product_id as string | null);
  const score = withFeedback<ScoredVideo>(scoreFor(goal), feedback);
  const clips = [...all].sort((a, b) => score(b) - score(a)).slice(0, 25);

  const res = await answerFollowUp(
    { name: input.productName ?? "", whatItIs: input.whatItIs ?? "", audience: input.audience ?? "" },
    goal,
    run.brief as string,
    parsed.data.question,
    clips.map((v) => ({
      handle: v.creatorHandle,
      platform: v.platform,
      caption: v.caption,
      views: v.views,
      multiplier: v.usual ?? v.reach,
      engagement: engagementRate(v),
    })),
    parsed.data.lang,
  );
  if (!res) return { ok: false as const };
  const cited = res.clips.map((i) => clips[i]).filter((v): v is ScoredVideo => !!v?.dbId);
  const params = new URLSearchParams({ q: res.brief, region: (run.region as string | null) ?? "th" });
  if (run.product_id) params.set("product", run.product_id as string);
  return {
    ok: true as const,
    reply: res.reply,
    clips: cited.map((v) => ({ dbId: v.dbId!, handle: v.creatorHandle, thumbnailUrl: v.thumbnailUrl, views: v.views, multiplier: v.usual ?? v.reach })),
    researchHref: res.kind === "research" && res.brief.trim() ? `/app?${params}` : null,
  } satisfies FollowUpReply & { ok: true };
}
