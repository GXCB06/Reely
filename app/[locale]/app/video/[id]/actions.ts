"use server";

import { z } from "zod";
import type { Script } from "@/lib/ai/schemas";
import { makeMyVersion } from "@/lib/ai/tasks";
import { isGoal } from "@/lib/goals";
import type { VideoRow } from "@/lib/db-mappers";
import { reachScore, usualScore } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";

export type SavedScript = { id: string; content: Script & { source: "ai" | "sample" }; created_at: string };

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

  const { data: video } = await supabase.from("videos").select("*").eq("id", id).maybeSingle<VideoRow>();
  if (!video) return { ok: false as const, error: "no-video" };

  const [{ data: creator }, { data: analysis }] = await Promise.all([
    supabase.from("creators").select("usual_views").eq("platform", video.platform).eq("handle", video.creator_handle).maybeSingle(),
    supabase.from("video_analyses").select("hook, format, angle").eq("video_id", id).maybeSingle(),
  ]);

  const script = await makeMyVersion(
    product,
    {
      caption: video.caption,
      views: video.views,
      usual: usualScore(video.views, (creator?.usual_views as number | null) ?? null),
      reach: reachScore(video.views, video.creator_followers),
      handle: video.creator_handle,
      platform: video.platform,
      hook: analysis?.hook ?? null,
      format: analysis?.format ?? null,
      angle: analysis?.angle ?? null,
    },
    lang,
    // The product's goal picks the script structure (e.g. demo → proof → Shop basket for sellers).
    isGoal(product.goal) ? product.goal : null,
  );

  const { data: saved, error } = await supabase
    .from("scripts")
    .insert({ product_id: product.id, video_id: id, locale: lang, content: script })
    .select("id, content, created_at")
    .single();
  if (error || !saved) return { ok: false as const, error: "save" };
  return { ok: true as const, script: saved as SavedScript };
}
