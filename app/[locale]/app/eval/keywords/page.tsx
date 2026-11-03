import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { EvalPlatform, Label } from "@/lib/eval";
import { loadEvalBrief } from "@/lib/eval-data";
import { type KeywordGroup, keywordGroups, keywordRows, type ScoreBrief, type ScoreClip } from "@/lib/eval-keywords";
import { isOwner } from "@/lib/limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { PlanPreview, type PreviewBrief } from "./plan-preview";

/**
 * Owner-only keyword scorecard: for every planned keyword of the test set, the results it brought, how many the
 * search called exact, and how many you labelled on target, per brief (its re-runs merged) and per kind of keyword.
 */
export default async function KeywordsPage({ params }: PageProps<"/[locale]/app/eval/keywords">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const admin = createAdminClient();
  if (!admin || !isOwner(claims?.claims?.email as string | undefined)) notFound();
  const t = await getTranslations("eval");

  const { data: set } = await admin.from("eval_briefs").select("run_id, parent_run_id, added_at, core, holdout").order("added_at");
  const rows = (set ?? []) as { run_id: string; parent_run_id: string | null; added_at: string; core: boolean; holdout: boolean }[];
  const briefs = (await Promise.all(rows.map((r) => loadEvalBrief(admin, r.run_id)))).filter((b) => b !== null);

  // One entry per brief: its researches' results merged (a clip counted once, with the keyword that first found it).
  const families = new Map<string, ScoreBrief & { seen: Set<string> }>();
  for (const r of rows) {
    const b = briefs.find((x) => x.run.id === r.run_id);
    if (!b) continue;
    const family = r.parent_run_id ?? r.run_id;
    const f =
      families.get(family) ??
      ({ family, title: b.run.title, productName: b.run.product.name, competitors: [], keywords: [], clips: [], seen: new Set<string>() } as ScoreBrief & { seen: Set<string> });
    for (const k of b.run.keywords) if (!f.keywords.includes(k)) f.keywords.push(k);
    for (const c of b.run.competitors) if (!f.competitors.includes(c)) f.competitors.push(c);
    for (const v of b.videos) {
      const id = String(v.dbId);
      const human = (b.userLabels.get(id) ?? null) as Label | null;
      if (f.seen.has(id)) {
        // A later research of the brief may carry the owner's label for a clip counted already.
        const known = f.clips.find((c) => c.videoId === id);
        if (known && known.human === null && human !== null) known.human = human;
        continue;
      }
      f.seen.add(id);
      f.clips.push({ videoId: id, platform: v.platform as EvalPlatform, keyword: v.keyword, relevance: v.relevance ?? null, human } satisfies ScoreClip);
    }
    families.set(family, f);
  }
  const scored = keywordRows([...families.values()]);
  // The briefs the new planner is tried on: core and hold-out originals, with the keywords they were first run with.
  const previewBriefs: PreviewBrief[] = rows
    .filter((r) => !r.parent_run_id && (r.core || r.holdout))
    .flatMap((r) => {
      const b = briefs.find((x) => x.run.id === r.run_id);
      return b ? [{ runId: r.run_id, title: b.run.title, productName: b.run.product.name, competitors: b.run.competitors, keywords: b.run.keywords, holdout: r.holdout }] : [];
    });
  const kinds = keywordGroups(scored, (r) => r.kind);
  const languages = keywordGroups(scored.filter((r) => r.kind !== "feeds"), (r) => (r.thai ? "thai" : "notThai"));

  const per = (n: number, of: number) => (of ? (n / of).toFixed(1) : "—");
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");
  const groupTable = (title: string, list: KeywordGroup[], name: (k: string) => string) => (
    <section className="space-y-2 rounded-3xl border bg-card p-4">
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium" />
              <th className="py-1.5 pr-3 font-medium">{t("keywords.count")}</th>
              <th className="py-1.5 pr-3 font-medium">{t("keywords.resultsPer")}</th>
              <th className="py-1.5 pr-3 font-medium">{t("keywords.exactPer")}</th>
              <th className="py-1.5 pr-3 font-medium">{t("keywords.onTargetPer")}</th>
              <th className="py-1.5 pr-3 font-medium">{t("keywords.onTargetRate")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((g) => (
              <tr key={g.key} className="border-t">
                <td className="py-1.5 pr-3 font-medium">{name(g.key)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{g.keywords}</td>
                <td className="py-1.5 pr-3 tabular-nums">{per(g.results, g.keywords)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{per(g.exact, g.keywords)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{per(g.onTarget, g.keywords)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{pct(g.onTarget, g.labelled)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div>
      <header className="page-wash px-4 pt-10 pb-8 md:px-10">
        <Link href="/app/eval" className="text-xs text-muted-foreground hover:underline">
          ← {t("title")}
        </Link>
        <h1 className="mt-1 font-heading text-3xl font-bold">{t("keywords.title")}</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">{t("keywords.subtitle")}</p>
      </header>
      <div className="space-y-6 px-4 pb-16 md:px-10">
        {groupTable(t("keywords.byKind"), kinds, (k) => t(`keywords.kind.${k}`))}
        {groupTable(t("keywords.byLanguage"), languages, (k) => t(`keywords.lang.${k}`))}
        <PlanPreview briefs={previewBriefs} />
        <section className="space-y-2 rounded-3xl border bg-card p-4">
          <h2 className="font-heading text-lg font-bold">{t("keywords.perBrief")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">{t("keywords.keyword")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("keywords.kindCol")}</th>
                  <th className="py-1.5 pr-3 font-medium">TikTok · YouTube · IG</th>
                  <th className="py-1.5 pr-3 font-medium">{t("keywords.exact")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("keywords.labelled")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("keywords.onTarget")}</th>
                </tr>
              </thead>
              <tbody>
                {[...families.values()].map((f) => (
                  <FamilyRows key={f.family} title={f.title} rows={scored.filter((r) => r.family === f.family)} kindName={(k) => t(`keywords.kind.${k}`)} feedsName={t("keywords.kind.feeds")} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <p className="text-xs text-muted-foreground">{t("keywords.note")}</p>
      </div>
    </div>
  );
}

function FamilyRows({
  title,
  rows,
  kindName,
  feedsName,
}: {
  title: string;
  rows: ReturnType<typeof keywordRows>;
  kindName: (k: string) => string;
  feedsName: string;
}) {
  return (
    <>
      <tr className="border-t-2">
        <td colSpan={6} className="pt-3 pb-1 font-heading font-bold">
          {title}
        </td>
      </tr>
      {rows.map((r, i) => (
        <tr key={`${r.keyword}:${i}`} className="border-t">
          <td className="py-1.5 pr-3">{r.keyword || <span className="text-muted-foreground">{feedsName}</span>}</td>
          <td className="py-1.5 pr-3 text-xs text-muted-foreground">{kindName(r.kind)}</td>
          <td className="py-1.5 pr-3 tabular-nums">
            {r.byPlatform.tiktok ?? 0} · {r.byPlatform.youtube ?? 0} · {r.byPlatform.instagram ?? 0}
          </td>
          <td className="py-1.5 pr-3 tabular-nums">{r.exact}</td>
          <td className="py-1.5 pr-3 tabular-nums">{r.labelled}</td>
          <td className={`py-1.5 pr-3 tabular-nums ${r.labelled && r.onTarget / r.labelled >= 0.5 ? "text-emerald-700" : r.labelled ? "text-rose-700" : ""}`}>
            {r.labelled ? `${r.onTarget} (${Math.round((r.onTarget / r.labelled) * 100)}%)` : "—"}
          </td>
        </tr>
      ))}
    </>
  );
}
