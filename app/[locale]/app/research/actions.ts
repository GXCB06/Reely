"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_KEYWORDS } from "@/lib/ai/schemas";
import { summarizeRun, understandProduct } from "@/lib/ai/tasks";
import { readLink } from "@/lib/link-preview";
import { keepRate } from "@/lib/scoring";
import { type ScoredVideo, searchKeywords } from "@/lib/search";
import { DEFAULT_MIN_VIEWS } from "@/lib/search-settings";
import { createClient } from "@/lib/supabase/server";

const MAX_PRODUCTS = 5;
/** A research can pull in new videos at most about once a day (credits). */
const REFRESH_COOLDOWN_MS = 20 * 3600e3;

const regionChoice = z.enum(["th", "global", "both"]);
const locale = z.enum(["th", "en"]);
const productId = z.string().uuid().nullable();
const settingsSchema = z.object({
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  minViews: z.number().int().min(0).max(10_000_000),
});
// A resized JPEG/PNG/WebP from the composer (~100-300 KB as base64).
const imageDataUrl = z
  .string()
  .max(1_400_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);
const thumbDataUrl = imageDataUrl.max(60_000);

const messageSchema = z
  .object({
    text: z.string().trim().max(1000),
    url: z.union([z.literal(""), z.string().trim().max(300)]),
    image: imageDataUrl.nullable(),
    region: regionChoice,
    locale,
    productId,
  })
  .refine((m) => m.text.length >= 3 || m.url || m.image || m.productId, { message: "empty" });

export type ChatMessageInput = z.infer<typeof messageSchema>;

/** Chat step 1: read the link (if any) and let AI work out the product and plan the keywords. */
export async function understandAction(input: ChatMessageInput) {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "empty" };
  const { text, url, image, region, locale, productId } = parsed.data;
  const supabase = await createClient();
  // A saved product ("agent memory"): reuse what we already know instead of asking again.
  const { data: saved } = productId
    ? await supabase.from("products").select("name, url, description, audience").eq("id", productId).maybeSingle()
    : { data: null };
  const link = url ? await readLink(url) : null;
  const understanding = await understandProduct({ text, link, image, region, saved }, locale);
  return { ok: true as const, understanding, linkRead: url ? link !== null : null, linkTitle: link?.title ?? null };
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
  }),
  keywords: z
    .array(z.object({ text: z.string().trim().min(2).max(80), region: z.enum(["th", "global"]) }))
    .min(1)
    .max(MAX_KEYWORDS),
  exclusions: z.array(z.string().trim().min(1).max(40)).max(10),
  platforms: z.array(z.enum(["tiktok", "youtube", "instagram"])).min(1),
  region: regionChoice,
  settings: settingsSchema,
  productId,
  locale,
});

export type RunInput = z.infer<typeof runSchema>;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The run's product: the chosen one, one with the same name, or a new one (up to 5) so it is remembered. */
async function resolveProduct(supabase: Supabase, input: RunInput): Promise<string | null> {
  if (input.productId) return input.productId;
  const { productName, whatItIs, audience } = input.understanding;
  const { data: products } = await supabase.from("products").select("id, name");
  const same = products?.find((p) => (p.name as string).trim().toLowerCase() === productName.trim().toLowerCase());
  if (same) return same.id as string;
  if ((products?.length ?? 0) >= MAX_PRODUCTS) return null;
  const { data } = await supabase
    .from("products")
    .insert({
      name: productName,
      url: input.url ? (/^https?:\/\//i.test(input.url) ? input.url : `https://${input.url}`) : null,
      description: whatItIs || null,
      audience: audience || null,
      language: input.locale,
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
});

/** Creates a research run, searches, saves ranked results and the AI insight card. Returns the run id. */
export async function runResearchAction(input: RunInput) {
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const { text, url, imageThumb, understanding, keywords, exclusions, platforms, region, settings, locale } = parsed.data;
  const brief = (text || `${understanding.productName}: ${understanding.whatItIs}`).slice(0, 1000);

  const supabase = await createClient();
  const productRowId = await resolveProduct(supabase, parsed.data);
  const { data: run, error: runError } = await supabase
    .from("research_runs")
    .insert({
      brief,
      title: understanding.productName,
      product_id: productRowId,
      keywords: keywords.map((k) => k.text),
      keyword_regions: keywords.map((k) => k.region),
      exclusions,
      platforms,
      region,
      settings,
      input: { text, url: url || null, imageThumb, ...understanding },
      status: "running",
    })
    .select("id")
    .single();
  if (runError || !run) return { ok: false as const, error: "save" };

  try {
    const product = { name: understanding.productName, whatItIs: understanding.whatItIs, audience: understanding.audience };
    const result = await searchKeywords(keywords, platforms, exclusions, { product, ...settings });
    const rows = result.videos.filter((v) => v.dbId !== undefined).map((v, i) => resultRow(run.id, v, i + 1));
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
        stats: { hidden: result.hidden, offTopic: result.offTopic },
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    const top = result.videos.slice(0, 15);
    const summary = await summarizeRun(
      {
        keywords: keywords.map((k) => k.text),
        totalVideos: result.videos.length,
        topViews: result.videos.reduce<number | null>((m, v) => Math.max(m ?? 0, v.views ?? 0), null),
        smallAccountsInTop10: top.slice(0, 10).filter((v) => (v.creatorFollowers ?? Infinity) < 10_000).length,
        breakouts: result.videos.filter((v) => v.label === "breakout").length,
        product,
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
    .select("id, keywords, keyword_regions, exclusions, platforms, settings, input, created_at, last_refreshed_at, status")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!run || run.status === "running") return { ok: false as const, error: "invalid" as const };
  const lastAt = new Date((run.last_refreshed_at as string | null) ?? (run.created_at as string)).getTime();
  if (Date.now() - lastAt < REFRESH_COOLDOWN_MS) return { ok: false as const, error: "tooSoon" as const };

  const sinceDays = (Date.now() - lastAt) / 864e5;
  const days = sinceDays <= 7 ? 7 : sinceDays <= 30 ? 30 : 90;
  const settings = (run.settings as { minViews?: number } | null) ?? {};
  const input = (run.input ?? {}) as { productName?: string; whatItIs?: string; audience?: string };
  const regions = (run.keyword_regions as ("th" | "global")[] | null) ?? [];
  const keywords = (run.keywords as string[]).map((text, i) => ({ text, region: regions[i] ?? ("th" as const) }));
  const product = input.productName
    ? { name: input.productName, whatItIs: input.whatItIs ?? "", audience: input.audience ?? "" }
    : undefined;

  const result = await searchKeywords(
    keywords,
    run.platforms as ("tiktok" | "youtube" | "instagram")[],
    (run.exclusions as string[]) ?? [],
    { product, days, minViews: settings.minViews ?? DEFAULT_MIN_VIEWS },
  );
  const { data: existing } = await supabase.from("run_results").select("video_id, rank").eq("run_id", run.id);
  const have = new Set((existing ?? []).map((r) => r.video_id as number));
  const maxRank = Math.max(0, ...(existing ?? []).map((r) => (r.rank as number | null) ?? 0));
  const fresh = result.videos.filter((v) => v.dbId !== undefined && !have.has(v.dbId));
  if (fresh.length) {
    const { error } = await supabase.from("run_results").insert(fresh.map((v, i) => resultRow(run.id, v, maxRank + i + 1)));
    if (error) return { ok: false as const, error: "failed" as const };
  }
  await supabase.from("research_runs").update({ last_refreshed_at: new Date().toISOString() }).eq("id", run.id);
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
