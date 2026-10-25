"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** Saves or un-saves a video for the signed-in user. Returns the new saved state. */
export async function toggleSaveAction(videoId: number, save: boolean) {
  const id = z.number().int().positive().parse(videoId);
  const supabase = await createClient();
  if (save) {
    const { error } = await supabase.from("saved_videos").upsert({ video_id: id }, { onConflict: "user_id,video_id" });
    return { saved: !error };
  }
  const { error } = await supabase.from("saved_videos").delete().eq("video_id", id);
  return { saved: Boolean(error) };
}
