"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildTodayDigest } from "@/lib/today";

/** Builds today's digest (once per day per user); the page re-renders with it afterwards. */
export async function buildTodayAction(locale: string) {
  const parsed = z.enum(["th", "en"]).safeParse(locale);
  if (!parsed.success) return { ok: false as const, error: "failed" as const };
  const res = await buildTodayDigest(parsed.data);
  revalidatePath("/[locale]/app/today", "page");
  return res;
}
