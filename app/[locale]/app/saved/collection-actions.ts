"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const MAX_COLLECTIONS = 20;

/** Saved page: a new folder for saved clips. */
export async function createCollectionAction(name: string) {
  const parsed = z.string().trim().min(1).max(40).safeParse(name);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const supabase = await createClient();
  const { count } = await supabase.from("collections").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_COLLECTIONS) return { ok: false as const, error: "limit" as const };
  const { data, error } = await supabase.from("collections").insert({ name: parsed.data }).select("id").single();
  if (error || !data) return { ok: false as const, error: "invalid" as const };
  revalidatePath("/[locale]/app/saved", "page");
  return { ok: true as const, id: data.id as string };
}

/** Deletes a folder; its clips stay saved, just not in a folder. */
export async function deleteCollectionAction(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  await supabase.from("collections").delete().eq("id", parsed.data);
  revalidatePath("/[locale]/app/saved", "page");
  return { ok: true as const };
}

/** Puts a saved clip in a folder (null = no folder). */
export async function moveToCollectionAction(videoId: number, collectionId: string | null) {
  const id = z.number().int().positive().parse(videoId);
  const target = z.string().uuid().nullable().parse(collectionId);
  const supabase = await createClient();
  const { error } = await supabase.from("saved_videos").update({ collection_id: target }).eq("video_id", id);
  revalidatePath("/[locale]/app/saved", "page");
  return { ok: !error };
}
