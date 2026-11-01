import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { type BriefMetrics, briefMetrics, latestBatch, summarize, summaryMarkdown } from "@/lib/eval";
import { loadEvalBrief } from "@/lib/eval-data";
import { evalClipsOf, REPLAY_VARIANTS, type ReplayVariant, replayGaps, replayOrder } from "@/lib/eval-replay";
import { isOwner } from "@/lib/limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { MetricTable } from "../metric-table";
import { ReplayRunner } from "./replay-runner";

// "Prepare" runs a relevance check and the judge for one brief per call.
export const maxDuration = 120;

/**
 * Owner-only: today's order next to other orders of the SAME stored results and labels (search quality S0), so an order
 * change is measured for free and without run-to-run noise. Core briefs, hold-out briefs and the latest re-run batch.
 */
export default async function ReplayPage({ params }: PageProps<"/[locale]/app/eval/replay">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const admin = createAdminClient();
  if (!admin || !isOwner(claims?.claims?.email as string | undefined)) notFound();
  const t = await getTranslations("eval");

  const { data: set } = await admin.from("eval_briefs").select("run_id, core, holdout, parent_run_id, added_at").order("added_at");
  const rows = (set ?? []) as { run_id: string; core: boolean; holdout: boolean; parent_run_id: string | null; added_at: string }[];
  const briefs = (await Promise.all(rows.map((r) => loadEvalBrief(admin, r.run_id)))).filter((b) => b !== null);

  const pending: string[] = [];
  const byVariant = new Map<ReplayVariant, Map<string, BriefMetrics>>(REPLAY_VARIANTS.map((v) => [v, new Map()]));
  for (const b of briefs) {
    const gaps = replayGaps(b.videos, b.run.goal, b.feedback, b.labels);
    if (gaps.unscored.length || gaps.clips.length || gaps.creators.length) pending.push(b.run.id);
    for (const v of REPLAY_VARIANTS) {
      const clips = evalClipsOf(replayOrder(v, b.videos, b.run.goal, b.feedback));
      byVariant.get(v)!.set(b.run.id, briefMetrics({ runId: b.run.id, region: b.run.region, clips, labels: b.labels, stats: b.run.stats, seconds: b.run.seconds }));
    }
  }

  const batch = new Set(latestBatch(rows).map((r) => r.run_id));
  const groups = [
    { key: "core", ids: rows.filter((r) => !r.parent_run_id && r.core && !r.holdout).map((r) => r.run_id) },
    { key: "holdout", ids: rows.filter((r) => !r.parent_run_id && r.holdout).map((r) => r.run_id) },
    { key: "batch", ids: rows.filter((r) => batch.has(r.run_id)).map((r) => r.run_id) },
  ].filter((g) => g.ids.length);
  const tables = groups.map((g) => ({
    key: g.key,
    rows: REPLAY_VARIANTS.map((v) => ({
      key: v,
      name: t(`replay.variant.${v}`),
      s: summarize(g.ids.map((id) => byVariant.get(v)!.get(id)).filter((m) => m !== undefined)),
    })),
  }));
  const markdown = tables.map((tb) => `### ${t(`replay.group.${tb.key}`)}\n\n${summaryMarkdown(tb.rows)}`).join("\n\n");
  const snapshot = Object.fromEntries(tables.map((tb) => [tb.key, Object.fromEntries(tb.rows.map((r) => [r.key, r.s]))]));

  return (
    <div>
      <header className="page-wash px-4 pt-10 pb-8 md:px-10">
        <Link href="/app/eval" className="text-xs text-muted-foreground hover:underline">
          ← {t("title")}
        </Link>
        <h1 className="mt-1 font-heading text-3xl font-bold">{t("replay.title")}</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">{t("replay.subtitle")}</p>
      </header>
      <div className="space-y-6 px-4 pb-16 md:px-10">
        <ReplayRunner pending={pending} markdown={markdown} snapshot={snapshot} />
        {tables.map((tb) => (
          <section key={tb.key} className="space-y-2 rounded-3xl border bg-card p-4">
            <h2 className="font-heading text-lg font-bold">{t(`replay.group.${tb.key}`)}</h2>
            <MetricTable rows={tb.rows} compare={{ keys: REPLAY_VARIANTS.filter((v) => v !== "live"), against: tb.rows[0].s }} />
          </section>
        ))}
        {!tables.length && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {REPLAY_VARIANTS.map((v) => (
            <li key={v}>
              <span className="font-medium text-foreground">{t(`replay.variant.${v}`)}</span>: {t(`replay.explain.${v}`)}
            </li>
          ))}
          <li>{t("replay.note")}</li>
        </ul>
      </div>
    </div>
  );
}
