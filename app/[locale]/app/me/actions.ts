"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordEvent } from "@/lib/event-log";
import { parseHandle } from "@/lib/handles";
import { MAX_CLIPS, NOTE_MAX } from "@/lib/canvas";
import type { StoredAudit } from "@/lib/channel-audit";
import { addOwnAccount, analyseChannel } from "@/lib/own-accounts";
import { createClient } from "@/lib/supabase/server";

const platform = z.enum(["tiktok", "youtube", "instagram"]);

/**
 * Adds one of the user's own channels from a pasted profile link or @handle (a bare handle needs the platform picked).
 * The one deep read happens here (cost rule 23), so the page can show numbers straight away.
 */
export async function addOwnAccountAction(productId: string, input: string, picked: string | null) {
  const parsed = z
    .object({ productId: z.string().uuid(), input: z.string().trim().min(2).max(300), picked: platform.nullable() })
    .safeParse({ productId, input, picked });
  if (!parsed.success) return { ok: false as const, error: "badHandle" as const };
  const handle = parseHandle(parsed.data.input);
  if (!handle) return { ok: false as const, error: "badHandle" as const };
  const which = handle.platform ?? parsed.data.picked;
  if (!which) return { ok: false as const, error: "pickPlatform" as const };
  const supabase = await createClient();
  const res = await addOwnAccount(supabase, parsed.data.productId, which, handle.handle);
  if (res.ok) await recordEvent(supabase, { name: "own_account_add", source: "other", props: { platform: which } });
  revalidatePath("/[locale]/app/me", "layout");
  return res.ok ? { ok: true as const, platform: which, handle: handle.handle } : res;
}

/** "Analyse my channel": one AI call, kept until the channel's posts are refreshed. No credits. */
export async function analyseChannelAction(platformName: string, handle: string, locale: string) {
  const parsed = z.object({ platform, handle: z.string().min(1).max(100), locale: z.enum(["th", "en"]) }).safeParse({ platform: platformName, handle, locale });
  if (!parsed.success) return { ok: false as const, error: "failed" as const };
  const supabase = await createClient();
  const res = await analyseChannel(supabase, parsed.data.platform, parsed.data.handle, parsed.data.locale);
  if (res.ok) await recordEvent(supabase, { name: "channel_audit", source: "other", props: { fresh: res.fresh, ideas: res.audit.ideas.length } });
  revalidatePath("/[locale]/app/me", "layout");
  return res.ok ? { ok: true as const } : res;
}

/**
 * "Open in canvas" on one of the audit's ideas: a new canvas for the channel's product with the clips the idea builds
 * on, and the idea itself as the canvas note.
 */
export async function ideaToCanvasAction(platformName: string, handle: string, index: number) {
  const parsed = z
    .object({ platform, handle: z.string().min(1).max(100), index: z.number().int().min(0).max(9) })
    .safeParse({ platform: platformName, handle, index });
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const { data: own } = await supabase.from("own_accounts").select("product_id, audit").eq("platform", parsed.data.platform).eq("handle", parsed.data.handle).maybeSingle();
  const idea = (own?.audit as StoredAudit | null)?.ideas[parsed.data.index];
  if (!own || !idea) return { ok: false as const };
  const note = [idea.title, idea.hook, idea.angle].filter(Boolean).join("\n").slice(0, NOTE_MAX);
  const { data: canvas, error } = await supabase
    .from("canvases")
    .insert({ product_id: own.product_id, title: idea.title.slice(0, 80), inputs: { clips: idea.videoIds.slice(0, MAX_CLIPS), note, link: null } })
    .select("id")
    .single();
  if (error || !canvas) return { ok: false as const };
  await recordEvent(supabase, { name: "idea_to_canvas", source: "other", props: { clips: Math.min(idea.videoIds.length, MAX_CLIPS) } });
  revalidatePath("/[locale]/app/canvas", "layout");
  return { ok: true as const, id: canvas.id as string };
}

/** Removes a channel from the user's list (its posts stay in the shared cache, like any looked-up creator). */
export async function removeOwnAccountAction(id: string) {
  if (!z.string().uuid().safeParse(id).success) return { ok: false as const };
  const supabase = await createClient();
  const { error } = await supabase.from("own_accounts").delete().eq("id", id);
  revalidatePath("/[locale]/app/me", "layout");
  return { ok: !error };
}
