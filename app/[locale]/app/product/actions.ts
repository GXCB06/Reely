"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { understandProduct } from "@/lib/ai/tasks";
import { GOALS } from "@/lib/goals";
import { readLink } from "@/lib/link-preview";
import { createClient } from "@/lib/supabase/server";

/** Products Reely remembers ("agent memory"); kept small so the chat chips stay readable. */
const MAX_PRODUCTS = 5;

const productSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.union([z.literal(""), z.string().trim().url().max(300)]),
  description: z.string().trim().max(1000),
  audience: z.string().trim().max(300),
  /** Comma-separated brand names; stored as a list (max 6). */
  competitors: z.string().trim().max(300),
  language: z.enum(["th", "en"]),
  /** What the clips are for; "" = not set yet (Reely guesses on the next research). */
  goal: z.union([z.enum(GOALS), z.literal("")]),
});

export type ProductForm = z.infer<typeof productSchema>;

/** Updates a product (with `id`) or adds a new one (up to 5). */
export async function saveProductAction(form: ProductForm, id?: string | null) {
  const parsed = productSchema.safeParse(form);
  if (!parsed.success) return { ok: false as const, field: String(parsed.error.issues[0]?.path[0] ?? "") };
  const productId = z.string().uuid().nullish().safeParse(id);
  if (!productId.success) return { ok: false as const, field: "" };
  const { url, description, audience, competitors, goal, ...rest } = parsed.data;
  const list = competitors
    .split(/[,\n]/)
    .map((c) => c.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 6);
  const values = {
    ...rest,
    url: url || null,
    description: description || null,
    audience: audience || null,
    competitors: list.length ? list : null,
    goal: goal || null,
  };

  const supabase = await createClient();
  if (productId.data) {
    const { error } = await supabase.from("products").update(values).eq("id", productId.data);
    if (error) return { ok: false as const, field: "" };
  } else {
    const { count } = await supabase.from("products").select("id", { count: "exact", head: true });
    if ((count ?? 0) >= MAX_PRODUCTS) return { ok: false as const, field: "limit" };
    const { error } = await supabase.from("products").insert(values);
    if (error) return { ok: false as const, field: "" };
  }
  revalidatePath("/[locale]/app", "layout");
  return { ok: true as const };
}

/** Removes a saved product. Its research chats stay (their product link is cleared). */
export async function deleteProductAction(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", parsed.data);
  revalidatePath("/[locale]/app", "layout");
  return { ok: !error };
}

/**
 * "Fill in from a link": reads the product page and lets the AI draft the form (name, what it does, audience,
 * competitors, goal). One Gemini call, no credits; nothing is saved until the user presses Add.
 */
export async function draftProductAction(url: string, lang: string) {
  const parsed = z.object({ url: z.string().trim().url().max(300), lang: z.enum(["th", "en"]) }).safeParse({ url, lang });
  if (!parsed.success) return { ok: false as const, error: "badUrl" as const };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false as const, error: "failed" as const };
  const link = await readLink(parsed.data.url);
  if (!link) return { ok: false as const, error: "unreadable" as const };
  const u = await understandProduct({ text: "", link, image: null, region: "th" }, parsed.data.lang);
  if (u.source !== "ai") return { ok: false as const, error: "failed" as const };
  return {
    ok: true as const,
    draft: {
      name: u.productName.slice(0, 80),
      url: parsed.data.url,
      description: u.whatItIs.slice(0, 1000),
      audience: u.audience.slice(0, 300),
      competitors: (u.competitors ?? []).join(", ").slice(0, 300),
      goal: u.goal,
    },
  };
}
