import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { repairCovers } from "@/lib/thumbs";

/** A batch of cover repairs (1 credit each, copied to storage) can take a while. */
export const maxDuration = 60;

const bodySchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(24) });

/** Repairs expired covers of the videos a user is looking at; returns video id → stored cover URL. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isSupabaseConfigured()) return Response.json({ covers: {} }, { status: 400 });
  // Route handlers are outside proxy.ts's /app gate, so check the session here (repairs spend credits).
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return Response.json({ covers: {} }, { status: 401 });
  const covers = await repairCovers([...new Set(parsed.data.ids)]);
  return Response.json({ covers: Object.fromEntries(covers) });
}
