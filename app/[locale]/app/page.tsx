import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ResearchChat, type SavedProduct } from "@/components/chat/research-chat";
import { HomeDashboard, HomeDashboardSkeleton } from "@/components/home/dashboard";
import { isSupabaseConfigured } from "@/lib/env";
import { isGoal } from "@/lib/goals";
import type { RegionChoice } from "@/lib/region";
import { createClient } from "@/lib/supabase/server";

const REGIONS = new Set<RegionChoice>(["th", "global", "both"]);

/** Searches run as server actions on this page and can take 30-60 s (Vercel's default limit is lower). */
export const maxDuration = 120;

/**
 * Home = the research chat. `?q=…&region=…&go=1` pre-fills and sends it (used by "search again" on results);
 * `?product=<id>` starts from a saved product.
 */
export default async function HomePage({ params, searchParams }: PageProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 1000) : "";
  const region = typeof sp.region === "string" && REGIONS.has(sp.region as RegionChoice) ? (sp.region as RegionChoice) : "th";
  const productId = typeof sp.product === "string" ? sp.product : null;

  let products: SavedProduct[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.from("products").select("id, name, goal").order("created_at");
    products = (data ?? []).map((p) => ({ id: p.id as string, name: p.name as string, goal: isGoal(p.goal) ? p.goal : null }));
  }

  // key: a fresh chat each time the link changes (e.g. "New research" while a chat is open).
  return (
    <ResearchChat
      key={`${q}|${region}|${productId}|${String(sp.n ?? "")}`}
      initialText={q}
      initialRegion={region}
      autoSend={sp.go === "1" && !!q}
      products={products}
      initialProductId={productId}
      dashboard={
        isSupabaseConfigured() ? (
          <Suspense fallback={<HomeDashboardSkeleton />}>
            <HomeDashboard />
          </Suspense>
        ) : null
      }
    />
  );
}
