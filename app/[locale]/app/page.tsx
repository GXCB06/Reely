import { ArrowRight, Sparkles } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { RunSummary } from "@/lib/ai/schemas";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type RunListItem = { id: string; brief: string; keywords: string[]; status: string; summary: RunSummary | null; created_at: string };

export default async function HomePage({ params }: PageProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const format = await getFormatter();

  let runs: RunListItem[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("research_runs")
      .select("id, brief, keywords, status, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(12);
    runs = (data ?? []) as RunListItem[];
  }

  return (
    <div>
      <header className="page-wash px-10 py-10">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
        <Link
          href="/app/research/new"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Sparkles className="size-4" /> {t("cta")}
        </Link>
      </header>

      <section className="px-10 pb-16">
        <h2 className="mb-4 font-heading text-lg font-bold">{t("recent")}</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noRuns")}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {runs.map((r) => (
              <Link
                key={r.id}
                href={`/app/research/${r.id}`}
                className="group flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition hover:shadow-md"
              >
                <p className="line-clamp-2 font-semibold">{r.summary?.headline ?? r.brief}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.brief}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.keywords.slice(0, 3).map((k) => (
                    <span key={k} className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      {k}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
                  <span>
                    {format.dateTime(new Date(r.created_at), { dateStyle: "medium" })}
                    {r.status !== "done" && <> · {t(`status.${r.status}`)}</>}
                  </span>
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
