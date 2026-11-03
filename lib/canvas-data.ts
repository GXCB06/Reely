import "server-only";
import type { HookBreakdown } from "@/lib/ai/schemas";
import type { CanvasRef } from "@/lib/ai/tasks";
import type { StoredAudit } from "@/lib/channel-audit";
import { type PostResult, postResult } from "@/lib/did-it-work";
import { type CanvasContent, type CanvasFormat, type CanvasInputs, parseInputs } from "@/lib/canvas";
import type { VideoRow } from "@/lib/db-mappers";
import { type Goal, isGoal } from "@/lib/goals";
import { usualScore } from "@/lib/scoring";
import type { createClient } from "@/lib/supabase/server";
import { firstSeconds, type Segment } from "@/lib/transcript";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** A clip as the canvas shows it (a small card), with what the prompt reads about it. */
export type CanvasClip = {
  id: number;
  platform: string;
  handle: string;
  thumbnailUrl: string | null;
  url: string;
  caption: string;
  views: number | null;
  usual: number | null;
};

export type CanvasOutput = {
  id: string;
  format: CanvasFormat;
  instructions: string;
  refine: string | null;
  content: CanvasContent;
  vote: -1 | 1 | null;
  createdAt: string;
  /** "Did it work?": the post this version became, and how it did against its channel's usual. */
  posted: PostedResult | null;
};

export type PostedResult = {
  id: number;
  handle: string;
  platform: string;
  thumbnailUrl: string | null;
  url: string;
  publishedAt: string | null;
  result: PostResult;
};

/** Linked posts with their result against each channel's usual views (from the cache; no credits). */
export async function postedResults(supabase: Supabase, ids: number[], now = Date.now()): Promise<Map<number, PostedResult>> {
  if (!ids.length) return new Map();
  const { data: rows } = await supabase.from("videos").select("id, platform, creator_handle, thumbnail_url, url, views, published_at").in("id", ids);
  const handles = [...new Set((rows ?? []).map((r) => r.creator_handle as string))];
  const { data: creators } = handles.length ? await supabase.from("creators").select("platform, handle, usual_views").in("handle", handles) : { data: [] };
  const usualOf = new Map((creators ?? []).map((c) => [`${c.platform}:${c.handle}`, c.usual_views as number | null]));
  return new Map(
    (rows ?? []).map((r) => [
      r.id as number,
      {
        id: r.id as number,
        handle: r.creator_handle as string,
        platform: r.platform as string,
        thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
        url: r.url as string,
        publishedAt: (r.published_at as string | null) ?? null,
        result: postResult(r.views as number | null, usualOf.get(`${r.platform}:${r.creator_handle}`) ?? null, (r.published_at as string | null) ?? null, now),
      },
    ]),
  );
}

export type CanvasProduct = {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  audience: string | null;
  competitors: string[];
  goal: Goal | null;
};

/** What works on the founder's own channel for this product (the latest My channels analysis), if there is one. */
export type MyChannel = { handle: string; platform: string; usual: number | null; points: string[] };

export type LoadedCanvas = {
  id: string;
  title: string;
  inputs: CanvasInputs;
  product: CanvasProduct;
  clips: CanvasClip[];
  outputs: CanvasOutput[];
  myChannel: MyChannel | null;
};

/** The product's most recently analysed own channel, as the canvas reads it (no AI call, no credits). */
async function myChannelFor(supabase: Supabase, productId: string): Promise<MyChannel | null> {
  const { data: own } = await supabase
    .from("own_accounts")
    .select("platform, handle, audit")
    .eq("product_id", productId)
    .not("audit", "is", null)
    .order("audit_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const points = ((own?.audit as StoredAudit | null)?.commonInHits ?? []).map((p) => p.point);
  if (!own || !points.length) return null;
  const { data: creator } = await supabase.from("creators").select("usual_views").eq("platform", own.platform).eq("handle", own.handle).maybeSingle();
  return { handle: own.handle as string, platform: own.platform as string, usual: (creator?.usual_views as number | null) ?? null, points };
}

/** Clips as small cards, in the order given, with each creator's usual views for the multiplier. */
export async function clipCards(supabase: Supabase, ids: number[]): Promise<CanvasClip[]> {
  if (!ids.length) return [];
  const { data: rows } = await supabase.from("videos").select("*").in("id", ids);
  const videos = (rows ?? []) as VideoRow[];
  const handles = [...new Set(videos.map((v) => v.creator_handle))];
  const { data: creators } = handles.length
    ? await supabase.from("creators").select("platform, handle, usual_views").in("handle", handles)
    : { data: [] };
  const usualOf = new Map((creators ?? []).map((c) => [`${c.platform}:${c.handle}`, c.usual_views as number | null]));
  const byId = new Map(videos.map((v) => [v.id, v]));
  return ids.flatMap((id) => {
    const v = byId.get(id);
    if (!v) return [];
    return [
      {
        id: v.id,
        platform: v.platform,
        handle: v.creator_handle,
        thumbnailUrl: v.thumbnail_url,
        url: v.url,
        caption: v.caption,
        views: v.views,
        usual: usualScore(v.views, usualOf.get(`${v.platform}:${v.creator_handle}`) ?? null),
      },
    ];
  });
}

/** One canvas with its product, clips and versions (newest first); null when it isn't the user's. */
export async function loadCanvas(supabase: Supabase, id: string): Promise<LoadedCanvas | null> {
  const { data: canvas } = await supabase.from("canvases").select("id, title, inputs, product_id").eq("id", id).maybeSingle();
  if (!canvas) return null;
  const inputs = parseInputs(canvas.inputs);
  const [{ data: product }, { data: outputs }, clips, myChannel] = await Promise.all([
    supabase.from("products").select("id, name, url, description, audience, competitors, goal").eq("id", canvas.product_id).maybeSingle(),
    supabase.from("canvas_outputs").select("id, format, instructions, refine, content, vote, created_at, posted_video_id").eq("canvas_id", id).order("created_at", { ascending: false }),
    clipCards(supabase, inputs.clips),
    myChannelFor(supabase, canvas.product_id as string),
  ]);
  if (!product) return null;
  const posted = await postedResults(supabase, (outputs ?? []).map((o) => o.posted_video_id as number | null).filter((v): v is number => v !== null));
  return {
    id: canvas.id as string,
    title: canvas.title as string,
    inputs,
    product: {
      id: product.id as string,
      name: product.name as string,
      url: (product.url as string | null) ?? null,
      description: (product.description as string | null) ?? null,
      audience: (product.audience as string | null) ?? null,
      competitors: (product.competitors as string[] | null) ?? [],
      goal: isGoal(product.goal) ? product.goal : null,
    },
    clips,
    outputs: (outputs ?? []).map((o) => ({
      id: o.id as string,
      format: o.format as CanvasFormat,
      instructions: o.instructions as string,
      refine: (o.refine as string | null) ?? null,
      content: o.content as CanvasContent,
      vote: (o.vote as -1 | 1 | null) ?? null,
      createdAt: o.created_at as string,
      posted: o.posted_video_id ? (posted.get(o.posted_video_id as number) ?? null) : null,
    })),
    myChannel,
  };
}

/**
 * What the prompt reads about each reference clip: caption, multiplier, the cached breakdown (hook, format, angle)
 * and, when someone read the clip, what is really said first. Reads only what is stored: no credits.
 */
export async function canvasRefs(supabase: Supabase, clips: CanvasClip[], lang: string): Promise<CanvasRef[]> {
  if (!clips.length) return [];
  const ids = clips.map((c) => c.id);
  const [{ data: analyses }, { data: transcripts }] = await Promise.all([
    supabase.from("video_analyses").select("video_id, hook, format, angle").in("video_id", ids),
    supabase.from("video_transcripts").select("video_id, status, segments, breakdowns").in("video_id", ids),
  ]);
  const analysisOf = new Map((analyses ?? []).map((a) => [a.video_id as number, a]));
  const transcriptOf = new Map((transcripts ?? []).map((t) => [t.video_id as number, t]));
  return clips.map((c) => {
    const a = analysisOf.get(c.id);
    const t = transcriptOf.get(c.id);
    const breakdowns = (t?.breakdowns ?? {}) as Record<string, HookBreakdown>;
    const real = breakdowns[lang] ?? Object.values(breakdowns)[0] ?? null;
    const spoken = t?.status === "ok" ? (real?.hook ?? firstSeconds((t.segments ?? []) as Segment[], 3)) : null;
    return {
      handle: c.handle,
      platform: c.platform,
      views: c.views,
      usual: c.usual,
      caption: c.caption,
      hook: (a?.hook as string | null) ?? null,
      format: (a?.format as string | null) ?? null,
      angle: (a?.angle as string | null) ?? null,
      spoken: spoken || null,
    };
  });
}

/** Clips to pick from: the best of the product's latest researches, and the user's saved clips (newest first). */
export async function clipChoices(supabase: Supabase, productId: string): Promise<{ research: CanvasClip[]; saved: CanvasClip[] }> {
  const [{ data: runs }, { data: saved }] = await Promise.all([
    supabase.from("research_runs").select("id").eq("product_id", productId).eq("status", "done").order("created_at", { ascending: false }).limit(3),
    supabase.from("saved_videos").select("video_id").order("created_at", { ascending: false }).limit(24),
  ]);
  const runIds = (runs ?? []).map((r) => r.id as string);
  const { data: results } = runIds.length
    ? await supabase.from("run_results").select("run_id, video_id, rank, relevance").in("run_id", runIds).order("rank").limit(120)
    : { data: [] };
  // Exact matches first (S1), newest research first, at most 12.
  const ordered = (results ?? [])
    .filter((r) => r.relevance !== 0 && r.relevance !== 1)
    .sort((a, b) => runIds.indexOf(a.run_id as string) - runIds.indexOf(b.run_id as string) || (a.rank as number) - (b.rank as number))
    .map((r) => r.video_id as number);
  const research = [...new Set(ordered)].slice(0, 12);
  const savedIds = [...new Set((saved ?? []).map((s) => s.video_id as number))];
  const [researchCards, savedCards] = await Promise.all([clipCards(supabase, research), clipCards(supabase, savedIds)]);
  return { research: researchCards, saved: savedCards };
}
