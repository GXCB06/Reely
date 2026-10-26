"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildFormat, getFormat, isFresh } from "@/lib/formats";
import { createClient } from "@/lib/supabase/server";

/** Builds the format page for one video (about 3 credits), unless a fresh one is already cached. */
export async function buildFormatAction(videoId: number, locale: string) {
  const parsed = z.object({ id: z.number().int().positive(), locale: z.enum(["th", "en"]) }).safeParse({ id: videoId, locale });
  if (!parsed.success) return { ok: false as const };
  const existing = await getFormat(parsed.data.id);
  if (existing && isFresh(existing)) return { ok: true as const };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const res = await buildFormat(parsed.data.id, (data?.claims?.sub as string | undefined) ?? null, parsed.data.locale);
  revalidatePath("/[locale]/app/format/[videoId]", "page");
  revalidatePath("/[locale]/app/formats", "page");
  return { ok: res.ok };
}
