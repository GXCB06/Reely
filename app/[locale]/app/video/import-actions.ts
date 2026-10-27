"use server";

import { after } from "next/server";
import { z } from "zod";
import { importClip, lookUpClipCreator } from "@/lib/clip-import";
import { parseClipLink } from "@/lib/clip-link";
import { createClient } from "@/lib/supabase/server";
import { persistThumbnails } from "@/lib/thumbs";

/** Chat: a pasted Instagram Reel or TikTok link opens that clip's page (breakdown, my version, more like it). */
export async function importClipAction(text: string) {
  const parsed = z.string().min(5).max(2000).safeParse(text);
  const link = parsed.success ? parseClipLink(parsed.data) : null;
  if (!link) return { ok: false as const, error: "notFound" as const };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false as const, error: "failed" as const };

  const res = await importClip(link);
  if (!res.ok) return res;
  const video = res.video;
  if (video) after(() => persistThumbnails([video]));
  return { ok: true as const, videoId: res.videoId };
}

/** Video page, right after a pasted link: the clip creator's usual views, so the multiplier can show. */
export async function lookUpClipCreatorAction(videoId: number) {
  const id = z.number().int().positive().parse(videoId);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return "failed" as const;
  const { data: video } = await supabase.from("videos").select("platform, creator_handle").eq("id", id).maybeSingle();
  if (!video?.creator_handle) return "failed" as const;
  return lookUpClipCreator(video.platform, video.creator_handle as string);
}
