"use server";

import { z } from "zod";
import { recordEvent } from "@/lib/event-log";
import { type ClientEvent, EVENT_SOURCES } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

/** 👍 (1), 👎 (-1) or take the vote back (0) on a clip, for one product. */
export async function voteClipAction(productId: string, videoId: number, vote: number, source?: string) {
  const parsed = z
    .object({ productId: z.string().uuid(), videoId: z.number().int().positive(), vote: z.union([z.literal(1), z.literal(-1), z.literal(0)]) })
    .safeParse({ productId, videoId, vote });
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const { productId: product_id, videoId: video_id } = parsed.data;
  const { error } =
    parsed.data.vote === 0
      ? await supabase.from("clip_feedback").delete().eq("product_id", product_id).eq("video_id", video_id)
      : await supabase
          .from("clip_feedback")
          .upsert({ product_id, video_id, vote: parsed.data.vote, updated_at: new Date().toISOString() }, { onConflict: "user_id,product_id,video_id" });
  if (!error && parsed.data.vote !== 0) {
    await recordEvent(supabase, { name: "vote", source: sourceParam(source), props: { vote: parsed.data.vote } });
  }
  return { ok: !error };
}

const sourceParam = (s?: string) => ((EVENT_SOURCES as readonly string[]).includes(s ?? "") ? (s as ClientEvent["source"]) : null);

/** Something the browser saw (a send that failed, a slow plan). Small enums and ids only; never what was typed. */
export async function logEventAction(event: ClientEvent) {
  const supabase = await createClient();
  await recordEvent(supabase, event);
}
