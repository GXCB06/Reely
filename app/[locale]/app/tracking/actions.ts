"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseHandle } from "@/lib/handles";
import { createClient } from "@/lib/supabase/server";

const MAX_TRACKED = 20;
const platformSchema = z.enum(["tiktok", "youtube", "instagram"]);

/** Adds an account to the user's tracking list. Posts are fetched the next time the page opens. */
export async function trackAccountAction(input: string, platform: "tiktok" | "youtube" | "instagram") {
  const parsed = parseHandle(input);
  const fallbackPlatform = platformSchema.safeParse(platform);
  if (!parsed || !fallbackPlatform.success) return { ok: false as const, error: "invalid" };
  const target = { platform: parsed.platform ?? fallbackPlatform.data, handle: parsed.handle };

  const supabase = await createClient();
  const { count } = await supabase.from("tracked_accounts").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_TRACKED) return { ok: false as const, error: "limit" };

  const { error } = await supabase
    .from("tracked_accounts")
    .upsert(target, { onConflict: "user_id,platform,handle", ignoreDuplicates: true });
  if (error) return { ok: false as const, error: "save" };
  revalidatePath("/[locale]/app/tracking", "page");
  return { ok: true as const, ...target };
}

export async function untrackAccountAction(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  await supabase.from("tracked_accounts").delete().eq("id", parsed.data);
  revalidatePath("/[locale]/app/tracking", "page");
  return { ok: true as const };
}
