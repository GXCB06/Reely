import { setRequestLocale } from "next-intl/server";
import { type RecentRun, Sidebar } from "@/components/shell/sidebar";
import { redirect } from "@/i18n/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import type { RegionChoice } from "@/lib/region";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children, params }: LayoutProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale);

  let email: string | null = null;
  let recent: RecentRun[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    email = (data?.claims?.email as string | undefined) ?? null;
    if (email) {
      const { data: runs } = await supabase
        .from("research_runs")
        .select("id, title, brief, region, status, pinned_at")
        .order("pinned_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(30);
      recent = (runs ?? []).map((r) => ({
        id: r.id as string,
        title: ((r.title as string | null) || (r.brief as string)).slice(0, 60),
        region: (r.region as RegionChoice | null) ?? "th",
        running: r.status === "running",
        pinned: r.pinned_at !== null,
      }));
    }
  }

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect({ href: "/login", locale });
  }

  return (
    <div className="flex min-h-dvh items-start bg-sidebar">
      <Sidebar email={email} recent={recent} onSignOut={email ? signOut : undefined} />
      <main className="mx-2 mt-16 mb-2 min-w-0 flex-1 overflow-hidden rounded-3xl bg-background md:my-2 md:mr-2 md:ml-0">
        {!isSupabaseConfigured() && (
          <p className="bg-amber-100 px-6 py-2 text-xs text-amber-900">
            Supabase keys are not set yet — sign-in and saving are off. Add them to .env.local.
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
