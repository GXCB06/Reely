"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordEvent } from "@/lib/event-log";
import { parseHandle } from "@/lib/handles";
import { addOwnAccount } from "@/lib/own-accounts";
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

/** Removes a channel from the user's list (its posts stay in the shared cache, like any looked-up creator). */
export async function removeOwnAccountAction(id: string) {
  if (!z.string().uuid().safeParse(id).success) return { ok: false as const };
  const supabase = await createClient();
  const { error } = await supabase.from("own_accounts").delete().eq("id", id);
  revalidatePath("/[locale]/app/me", "layout");
  return { ok: !error };
}
