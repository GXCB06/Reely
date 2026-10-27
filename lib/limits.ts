import "server-only";
import { RESEARCHES_PER_DAY } from "./search-settings";
import type { createClient } from "@/lib/supabase/server";

// A TikTok + Reels research is ~25-31 credits, so a few friends researching all day would empty the ScrapeCreators
// balance in weeks: everyone gets RESEARCHES_PER_DAY a day. Owners (REELY_OWNER_EMAILS, comma-separated) have no cap.

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Midnight in Thailand (UTC+7), as an ISO string. */
export function thaiDayStart(now = Date.now()) {
  const shifted = new Date(now + 7 * 3600e3);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 7 * 3600e3).toISOString();
}

export function isOwner(email: string | null | undefined) {
  const owners = (process.env.REELY_OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && owners.includes(email.toLowerCase());
}

/** How many researches the signed-in user has left today (null = no cap). */
export async function researchesLeft(supabase: Supabase): Promise<number | null> {
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims || isOwner(data.claims.email as string | undefined)) return null;
  const { count } = await supabase
    .from("research_runs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", thaiDayStart());
  return Math.max(0, RESEARCHES_PER_DAY - (count ?? 0));
}
