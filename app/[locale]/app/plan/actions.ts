"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildPlan } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

/** Makes (or remakes) this week's plan for one product. One AI call, no credits. */
export async function buildPlanAction(productId: string, locale: string) {
  const parsed = z.object({ productId: z.string().uuid(), locale: z.enum(["th", "en"]) }).safeParse({ productId, locale });
  if (!parsed.success) return { ok: false as const, error: "failed" as const };
  const supabase = await createClient();
  const res = await buildPlan(supabase, parsed.data.productId, parsed.data.locale);
  revalidatePath("/[locale]/app/plan", "page");
  return res;
}
