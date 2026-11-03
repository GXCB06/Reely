"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeCanvas } from "@/lib/ai/tasks";
import {
  CANVAS_FORMATS,
  CANVAS_PER_DAY,
  CANVAS_REFINES,
  type CanvasContent,
  INSTRUCTIONS_MAX,
  MAX_CLIPS,
  NOTE_MAX,
  parseInputs,
  SCRIPT_FORMATS,
} from "@/lib/canvas";
import { canvasRefs, loadCanvas } from "@/lib/canvas-data";
import { importClip } from "@/lib/clip-import";
import { parseClipLink } from "@/lib/clip-link";
import { readLink } from "@/lib/link-preview";
import { createClient } from "@/lib/supabase/server";

// Every action runs as the signed-in user: RLS keeps canvases and their versions to their owner.

const uuid = z.string().uuid();
const lang = z.enum(["th", "en"]);
const refresh = () => revalidatePath("/[locale]/app/canvas", "layout");

/** A new canvas for one of the user's products, optionally starting with some clips ("Open in canvas"). */
export async function createCanvasAction(productId: string, clipIds: number[] = []) {
  const parsed = z
    .object({ productId: uuid, clipIds: z.array(z.number().int().positive()).max(MAX_CLIPS) })
    .safeParse({ productId, clipIds });
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("canvases")
    .insert({ product_id: parsed.data.productId, inputs: { clips: [...new Set(parsed.data.clipIds)], note: "", link: null } })
    .select("id")
    .single();
  refresh();
  return error || !data ? { ok: false as const } : { ok: true as const, id: data.id as string };
}

/** Reads, changes and writes a canvas's inputs (the user's own row only). */
async function updateInputs(canvasId: string, change: (inputs: ReturnType<typeof parseInputs>) => ReturnType<typeof parseInputs>) {
  const supabase = await createClient();
  const { data } = await supabase.from("canvases").select("inputs").eq("id", canvasId).maybeSingle();
  if (!data) return false;
  const { error } = await supabase
    .from("canvases")
    .update({ inputs: parseInputs(change(parseInputs(data.inputs))), updated_at: new Date().toISOString() })
    .eq("id", canvasId);
  refresh();
  return !error;
}

export async function addClipsAction(canvasId: string, ids: number[]) {
  const parsed = z.object({ canvasId: uuid, ids: z.array(z.number().int().positive()).min(1).max(MAX_CLIPS) }).safeParse({ canvasId, ids });
  if (!parsed.success) return { ok: false as const };
  const ok = await updateInputs(parsed.data.canvasId, (i) => ({ ...i, clips: [...new Set([...i.clips, ...parsed.data.ids])] }));
  return { ok };
}

export async function removeClipAction(canvasId: string, id: number) {
  const parsed = z.object({ canvasId: uuid, id: z.number().int().positive() }).safeParse({ canvasId, id });
  if (!parsed.success) return { ok: false as const };
  return { ok: await updateInputs(parsed.data.canvasId, (i) => ({ ...i, clips: i.clips.filter((c) => c !== parsed.data.id) })) };
}

/** A pasted TikTok / Instagram link: read like any pasted clip (cached 24 h, otherwise 1 credit), then added. */
export async function addClipLinkAction(canvasId: string, text: string) {
  const parsed = z.object({ canvasId: uuid, text: z.string().trim().min(8).max(400) }).safeParse({ canvasId, text });
  if (!parsed.success) return { ok: false as const, error: "badLink" as const };
  const link = parseClipLink(parsed.data.text);
  if (!link) return { ok: false as const, error: "badLink" as const };
  const res = await importClip(link);
  if (!res.ok) return { ok: false as const, error: res.error };
  return { ok: await updateInputs(parsed.data.canvasId, (i) => ({ ...i, clips: [...new Set([...i.clips, res.videoId])] })) };
}

/** The founder's note (the offer, what to avoid…) and an optional page to read. */
export async function setNoteAction(canvasId: string, note: string, link: string) {
  const parsed = z
    .object({ canvasId: uuid, note: z.string().max(NOTE_MAX), link: z.union([z.literal(""), z.string().trim().url().max(300)]) })
    .safeParse({ canvasId, note, link });
  if (!parsed.success) return { ok: false as const };
  return { ok: await updateInputs(parsed.data.canvasId, (i) => ({ ...i, note: parsed.data.note, link: parsed.data.link || null })) };
}

export async function renameCanvasAction(canvasId: string, title: string) {
  const parsed = z.object({ canvasId: uuid, title: z.string().trim().max(80) }).safeParse({ canvasId, title });
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const { error } = await supabase.from("canvases").update({ title: parsed.data.title }).eq("id", parsed.data.canvasId);
  refresh();
  return { ok: !error };
}

export async function deleteCanvasAction(canvasId: string) {
  if (!uuid.safeParse(canvasId).success) return { ok: false as const };
  const supabase = await createClient();
  const { error } = await supabase.from("canvases").delete().eq("id", canvasId);
  refresh();
  return { ok: !error };
}

/** True while the user has generations left today (rolling 24 h). */
async function underDailyCap(supabase: Awaited<ReturnType<typeof createClient>>) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase.from("canvas_outputs").select("id", { count: "exact", head: true }).gte("created_at", since);
  return (count ?? 0) < CANVAS_PER_DAY;
}

const generateInput = z.object({
  canvasId: uuid,
  format: z.enum(CANVAS_FORMATS),
  instructions: z.string().trim().max(INSTRUCTIONS_MAX),
  lang,
  refine: z.object({ outputId: uuid, kind: z.enum(CANVAS_REFINES) }).nullable(),
});

/**
 * One generation: the canvas's product, clips, note and page into one fixed format (one AI call, no credits), or a
 * one-tap rewrite of an earlier version. Every version is kept.
 */
export async function generateAction(
  canvasId: string,
  format: string,
  instructions: string,
  locale: string,
  refine: { outputId: string; kind: string } | null = null,
) {
  const parsed = generateInput.safeParse({ canvasId, format, instructions, lang: locale, refine });
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const supabase = await createClient();
  if (!(await underDailyCap(supabase))) return { ok: false as const, error: "limit" as const };
  const canvas = await loadCanvas(supabase, parsed.data.canvasId);
  if (!canvas) return { ok: false as const, error: "invalid" as const };
  const previous = parsed.data.refine ? canvas.outputs.find((o) => o.id === parsed.data.refine!.outputId) : null;
  if (parsed.data.refine && !previous) return { ok: false as const, error: "invalid" as const };

  const [refs, page] = await Promise.all([
    canvasRefs(supabase, canvas.clips, parsed.data.lang),
    canvas.inputs.link ? readLink(canvas.inputs.link) : Promise.resolve(null),
  ]);
  const content = await writeCanvas({
    format: previous ? previous.format : parsed.data.format,
    refs,
    product: canvas.product,
    goal: canvas.product.goal,
    note: canvas.inputs.note,
    page,
    instructions: parsed.data.instructions,
    locale: parsed.data.lang,
    refine: previous ? { kind: parsed.data.refine!.kind, previous: previous.content } : null,
  });
  if (!content) return { ok: false as const, error: "failed" as const };

  const { error } = await supabase.from("canvas_outputs").insert({
    canvas_id: canvas.id,
    format: content.format,
    instructions: parsed.data.instructions,
    refine: parsed.data.refine?.kind ?? null,
    content,
  });
  // The first titled version names an untitled canvas.
  const title = "title" in content ? content.title : null;
  await supabase
    .from("canvases")
    .update({ updated_at: new Date().toISOString(), ...(!canvas.title && title ? { title: title.slice(0, 80) } : {}) })
    .eq("id", canvas.id);
  refresh();
  return error ? { ok: false as const, error: "failed" as const } : { ok: true as const };
}

export async function voteOutputAction(outputId: string, vote: number | null) {
  const parsed = z.object({ outputId: uuid, vote: z.union([z.literal(1), z.literal(-1), z.null()]) }).safeParse({ outputId, vote });
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const { error } = await supabase.from("canvas_outputs").update({ vote: parsed.data.vote }).eq("id", parsed.data.outputId);
  refresh();
  return { ok: !error };
}

/** A script version saved to Scripts, linked to the canvas (and to its first clip, so it also shows on that clip's page). */
export async function saveScriptAction(outputId: string, locale: string) {
  const parsed = z.object({ outputId: uuid, lang }).safeParse({ outputId, lang: locale });
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const { data: output } = await supabase.from("canvas_outputs").select("canvas_id, content").eq("id", parsed.data.outputId).maybeSingle();
  const content = output?.content as CanvasContent | undefined;
  if (!output || !content || !SCRIPT_FORMATS.has(content.format)) return { ok: false as const };
  const { data: canvas } = await supabase.from("canvases").select("product_id, inputs").eq("id", output.canvas_id).maybeSingle();
  if (!canvas) return { ok: false as const };
  const script: Partial<typeof content> = { ...content };
  delete script.format;
  const { error } = await supabase.from("scripts").insert({
    product_id: canvas.product_id,
    video_id: parseInputs(canvas.inputs).clips[0] ?? null,
    canvas_id: output.canvas_id,
    locale: parsed.data.lang,
    content: { ...script, source: "ai" },
  });
  return { ok: !error };
}
