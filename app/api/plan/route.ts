import { z } from "zod";
import type { PlanEvent } from "@/lib/ai/schemas";
import { understandProduct } from "@/lib/ai/tasks";
import { isSupabaseConfigured } from "@/lib/env";
import { GOALS, isGoal } from "@/lib/goals";
import { readLink } from "@/lib/link-preview";
import { createClient } from "@/lib/supabase/server";

/** Gemini can take 20-30 s for a plan (45 s cap in understandProduct), plus reading the product link. */
export const maxDuration = 60;

// A resized JPEG/PNG/WebP from the composer (~100-300 KB as base64).
const imageDataUrl = z
  .string()
  .max(1_400_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);

const bodySchema = z
  .object({
    text: z.string().trim().max(1000),
    url: z.union([z.literal(""), z.string().trim().max(300)]),
    image: imageDataUrl.nullable(),
    region: z.enum(["th", "global", "both"]),
    locale: z.enum(["th", "en"]),
    productId: z.string().uuid().nullable(),
    /** Picked by the user (or remembered with the product); null = let AI work it out. */
    goal: z.enum(GOALS).nullable().default(null),
    /** Reels is on: keywords need English versions (Instagram's search only understands English). */
    english: z.boolean().default(false),
  })
  .refine((m) => m.text.length >= 3 || m.url || m.image || m.productId, { message: "empty" });

export type PlanRequest = z.input<typeof bodySchema>;

/** Drafts go out at most this often; the finished plan always follows. */
const DRAFT_EVERY_MS = 120;

/**
 * Chat step 1: reads the link (if any) and lets AI work out the goal and plan the keywords, streamed so the chat
 * can show the plan as it is written. Sends one JSON event per line: drafts, then the finished plan.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "empty" }, { status: 400 });
  const { text, url, image, region, locale, productId, english } = parsed.data;

  // Route handlers are outside proxy.ts's /app gate, so check the session here.
  const supabase = isSupabaseConfigured() ? await createClient() : null;
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) return Response.json({ error: "auth" }, { status: 401 });
  }
  // A saved product ("agent memory"): reuse what we already know instead of asking again, including its goal.
  const { data: saved } =
    supabase && productId
      ? await supabase.from("products").select("name, url, description, audience, competitors, goal").eq("id", productId).maybeSingle()
      : { data: null };
  const goal = parsed.data.goal ?? (isGoal(saved?.goal) ? saved.goal : null);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PlanEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const link = url ? await readLink(url) : null;
        let last = 0;
        const understanding = await understandProduct({ text, link, image, region, saved, goal, english }, locale, (plan) => {
          const now = Date.now();
          if (now - last < DRAFT_EVERY_MS) return;
          last = now;
          send({ type: "draft", plan });
        });
        send({ type: "done", understanding, linkRead: url ? link !== null : null });
      } catch (e) {
        console.warn("[plan] failed", (e as Error).message);
        send({ type: "error" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
