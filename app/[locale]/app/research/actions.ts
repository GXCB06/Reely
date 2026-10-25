"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_KEYWORDS } from "@/lib/ai/schemas";
import { summarizeRun, understandProduct } from "@/lib/ai/tasks";
import { readLink } from "@/lib/link-preview";
import { searchKeywords } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

const regionChoice = z.enum(["th", "global", "both"]);
const locale = z.enum(["th", "en"]);
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
  })
  .refine((m) => m.text.length >= 3 || m.url || m.image, { message: "empty" });

export type ChatMessageInput = z.infer<typeof messageSchema>;

/** Chat step 1: read the link (if any) and let AI work out the product and plan the keywords. */
export async function understandAction(input: ChatMessageInput) {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "empty" };
  const { text, url, image, region, locale } = parsed.data;
  const link = url ? await readLink(url) : null;
  const understanding = await understandProduct({ text, link, image, region }, locale);
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
  locale,
});

export type RunInput = z.infer<typeof runSchema>;

/** Creates a research run, searches, saves ranked results and the AI insight card. Returns the run id. */
export async function runResearchAction(input: RunInput) {
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const { text, url, imageThumb, understanding, keywords, exclusions, platforms, region, locale } = parsed.data;
  const brief = (text || `${understanding.productName}: ${understanding.whatItIs}`).slice(0, 1000);

  const supabase = await createClient();
  const { data: run, error: runError } = await supabase
    .from("research_runs")
    .insert({
      brief,
      title: understanding.productName,
      keywords: keywords.map((k) => k.text),
      keyword_regions: keywords.map((k) => k.region),
      exclusions,
      platforms,
      region,
      input: { text, url: url || null, imageThumb, ...understanding },
      status: "running",
    })
    .select("id")
    .single();
  if (runError || !run) return { ok: false as const, error: "save" };

  // First run with no saved product: save what Reely understood, so "Make my version" works right away.
  const { data: product } = await supabase.from("products").select("id").limit(1).maybeSingle();
  if (!product) {
    await supabase.from("products").insert({
      name: understanding.productName,
      url: url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : null,
      description: understanding.whatItIs || null,
      audience: understanding.audience || null,
      language: locale,
    });
  }

  try {
    const result = await searchKeywords(keywords, platforms, exclusions);
    const rows = result.videos
      .filter((v) => v.dbId !== undefined)
      .map((v, i) => ({
        run_id: run.id,
        video_id: v.dbId!,
        keyword: v.keyword,
        reach_score: v.reach,
        usual_score: v.usual,
        usual_views: v.usualViews === null ? null : Math.round(v.usualViews),
        label: v.label,
        rank: i + 1,
      }));
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
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    const top = result.videos.slice(0, 10);
    const summary = await summarizeRun(
      {
        keywords: keywords.map((k) => k.text),
        totalVideos: result.videos.length,
        topViews: result.videos.reduce<number | null>((m, v) => Math.max(m ?? 0, v.views ?? 0), null),
        smallAccountsInTop10: top.filter((v) => (v.creatorFollowers ?? Infinity) < 10_000).length,
        breakouts: result.videos.filter((v) => v.label === "breakout").length,
        top: top.map((v) => ({
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
