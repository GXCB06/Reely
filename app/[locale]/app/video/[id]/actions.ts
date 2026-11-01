"use server";

import { z } from "zod";
import { readHook } from "@/lib/hook-breakdown";
import { isGoal } from "@/lib/goals";
import type { VideoRow } from "@/lib/db-mappers";
import { writeScript } from "@/lib/scripts";
import { createClient } from "@/lib/supabase/server";

/** Video page: reads the clip's real hook (transcript, 1 credit the first time anyone asks) and breaks it down. */
export async function readHookAction(videoId: number, locale: string) {
  const id = z.number().int().positive().parse(videoId);
  const lang = locale === "en" ? "en" : "th";
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false as const, error: "failed" as const };
  const { data: video } = await supabase.from("videos").select("*").eq("id", id).maybeSingle<VideoRow>();
  if (!video) return { ok: false as const, error: "failed" as const };
  return readHook(video, lang);
}

export type { SavedScript } from "@/lib/scripts";

/** Writes a script that adapts this video's structure to the user's product, and saves it. */
export async function makeMyVersionAction(videoId: number, locale: string, productId?: string | null) {
  const id = z.number().int().positive().parse(videoId);
  const chosen = z.string().uuid().nullish().parse(productId);
  const lang = locale === "en" ? "en" : "th";
  const supabase = await createClient();

  // The chosen product, or the first one saved.
  let query = supabase.from("products").select("id, name, url, description, audience, goal");
  query = chosen ? query.eq("id", chosen) : query.order("created_at").limit(1);
  const { data: product } = await query.maybeSingle();
  if (!product) return { ok: false as const, error: "no-product" };

  const { data: exists } = await supabase.from("videos").select("id").eq("id", id).maybeSingle();
  if (!exists) return { ok: false as const, error: "no-video" };
  const saved = await writeScript(supabase, id, product, lang, isGoal(product.goal) ? product.goal : null);
  if (!saved) return { ok: false as const, error: "save" };
  return { ok: true as const, script: saved };
}
