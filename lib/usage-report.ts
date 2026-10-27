import "server-only";
import { isOwner, thaiDayStart } from "@/lib/limits";
import { RESEARCHES_PER_DAY } from "@/lib/search-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type UsageReport = {
  today: number;
  month: number;
  /** Null when there is no cap (owners, or no cap for anyone). */
  cap: number | null;
  owner: boolean;
  /** ScrapeCreators calls logged in api_usage (1 credit each), for everyone. */
  credits: { today: number; month: number };
  /** Owners only: researches per person. */
  people: { email: string; month: number; today: number }[] | null;
};

const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

/** Account page: the user's own researches, credits used by everyone, and (owners) researches per person. */
export async function usageReport(supabase: Supabase): Promise<UsageReport> {
  const { data: claims } = await supabase.auth.getClaims();
  const owner = isOwner(claims?.claims?.email as string | undefined);
  const dayStart = thaiDayStart();
  const [{ count: today }, { count: month }] = await Promise.all([
    supabase.from("research_runs").select("id", { count: "exact", head: true }).gte("created_at", dayStart),
    supabase.from("research_runs").select("id", { count: "exact", head: true }).gte("created_at", monthStart()),
  ]);

  const admin = createAdminClient();
  const credits = { today: 0, month: 0 };
  let people: UsageReport["people"] = null;
  if (admin) {
    const { data: usage } = await admin
      .from("api_usage")
      .select("day, calls")
      .eq("provider", "scrapecreators")
      .gte("day", monthStart().slice(0, 10));
    const utcToday = new Date().toISOString().slice(0, 10);
    for (const r of usage ?? []) {
      credits.month += r.calls as number;
      if (r.day === utcToday) credits.today += r.calls as number;
    }
    if (owner) {
      const [{ data: runs }, { data: users }] = await Promise.all([
        admin.from("research_runs").select("user_id, created_at").gte("created_at", monthStart()),
        admin.auth.admin.listUsers({ perPage: 200 }),
      ]);
      const byUser = new Map<string, { month: number; today: number }>();
      for (const r of runs ?? []) {
        const u = byUser.get(r.user_id as string) ?? { month: 0, today: 0 };
        u.month++;
        if (new Date(r.created_at as string).getTime() >= new Date(dayStart).getTime()) u.today++;
        byUser.set(r.user_id as string, u);
      }
      const emailOf = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? u.id]));
      people = [...byUser].map(([id, u]) => ({ email: emailOf.get(id) ?? id, ...u })).sort((a, b) => b.month - a.month);
    }
  }
  return { today: today ?? 0, month: month ?? 0, cap: owner ? null : RESEARCHES_PER_DAY, owner, credits, people };
}
