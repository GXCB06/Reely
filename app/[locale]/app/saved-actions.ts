"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordEvent } from "@/lib/event-log";
import { EVENT_SOURCES, type ClientEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

/** Saves or un-saves a video for the signed-in user. Returns the new saved state. */
export async function toggleSaveAction(videoId: number, save: boolean, source?: string) {
  const id = z.number().int().positive().parse(videoId);
  const supabase = await createClient();
  // The Saved page is kept in the browser for 30 s (staleTimes): drop that copy so it shows the change.
  revalidatePath("/[locale]/app/saved", "page");
  if (save) {
    const { error } = await supabase.from("saved_videos").upsert({ video_id: id }, { onConflict: "user_id,video_id" });
    if (!error) {
      const from = (EVENT_SOURCES as readonly string[]).includes(source ?? "") ? (source as ClientEvent["source"]) : null;
      await recordEvent(supabase, { name: "save", source: from });
    }
    return { saved: !error };
  }
  const { error } = await supabase.from("saved_videos").delete().eq("video_id", id);
  return { saved: Boolean(error) };
}
