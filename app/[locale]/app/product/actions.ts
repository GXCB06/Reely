"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const productSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.union([z.literal(""), z.string().trim().url().max(300)]),
  description: z.string().trim().max(1000),
  audience: z.string().trim().max(300),
  language: z.enum(["th", "en"]),
});

export type ProductForm = z.infer<typeof productSchema>;

/** One product per user for the MVP: updates the existing row or creates it. */
export async function saveProductAction(form: ProductForm) {
  const parsed = productSchema.safeParse(form);
  if (!parsed.success) return { ok: false as const, field: String(parsed.error.issues[0]?.path[0] ?? "") };
  const { url, description, audience, ...rest } = parsed.data;
  const values = { ...rest, url: url || null, description: description || null, audience: audience || null };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("products").select("id").order("created_at").limit(1).maybeSingle();
  const { error } = existing
    ? await supabase.from("products").update(values).eq("id", existing.id)
    : await supabase.from("products").insert(values);
  if (error) return { ok: false as const, field: "" };
  revalidatePath("/[locale]/app", "layout");
  return { ok: true as const };
}
