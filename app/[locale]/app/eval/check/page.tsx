import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AGREEMENT_BAR, type Agreement, type AgreementPair, agreement, EVAL_PLATFORMS } from "@/lib/eval";
import { loadCheck } from "@/lib/eval-check";
import { feedClipStats, loadEvalBrief } from "@/lib/eval-data";
import { isOwner } from "@/lib/limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { looksThai } from "@/lib/region";
import { CheckCard } from "./check-card";
import { RelevanceTrial } from "./relevance-trial";
import { TrialRunner } from "./trial-runner";
import { CoversTrial } from "./covers-trial";
import { VotesTrial } from "./votes-trial";

/**
 * Owner-only judge check (search quality S0): you label a fixed sample of 60 judged clips without seeing the AI's
 * answer; the page then shows how far the AI judge (and the search's own relevance score) agrees with you.
 */
export default async function CheckPage({ params, searchParams }: PageProps<"/[locale]/app/eval/check">) {
  const { locale } = await params;
  // The new judge's test-half numbers show only when asked for (?final=1): it is measured on them once, at the end.
  const final = (await searchParams).final === "1";
  setRequestLocale(locale);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const admin = createAdminClient();
  if (!admin || !isOwner(claims?.claims?.email as string | undefined)) notFound();
  const t = await getTranslations("eval");

  const { data: set } = await admin.from("eval_briefs").select("run_id, parent_run_id, added_at");
  const rows = (set ?? []) as { run_id: string; parent_run_id: string | null; added_at: string }[];
  const briefs = (await Promise.all(rows.map((r) => loadEvalBrief(admin, r.run_id)))).filter((b) => b !== null);
  const [check, feeds] = await Promise.all([loadCheck(admin, rows, briefs), feedClipStats(admin, briefs)]);
  const next = check.sample.find((s) => s.user === null) ?? null;
  const done = check.sample.length - check.sample.filter((s) => s.user === null).length;

  const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
  const tone = (x: number | null) => (x === null ? "" : x >= AGREEMENT_BAR ? "text-emerald-700" : "text-rose-700");
  const splits = (pairs: AgreementPair[]) => [
    { key: "all", name: t("check.all"), a: agreement(pairs) },
    ...EVAL_PLATFORMS.map((p) => ({ key: p, name: p === "instagram" ? "Instagram" : p === "youtube" ? "YouTube" : "TikTok", a: agreement(pairs.filter((x) => x.platform === p)) })),
    { key: "thai", name: t("check.thai"), a: agreement(pairs.filter((x) => x.thai)) },
    { key: "other", name: t("check.notThai"), a: agreement(pairs.filter((x) => !x.thai)) },
  ];
  const table = (title: string, list: { key: string; name: string; a: Agreement }[]) => (
    <section className="space-y-2 rounded-3xl border bg-card p-4">
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium" />
              <th className="py-1.5 pr-3 font-medium">{t("check.n")}</th>
              <th className="py-1.5 pr-3 font-medium">{t("check.exact")}</th>
              <th className="py-1.5 pr-3 font-medium">{t("check.precision2")}</th>
              <th className="py-1.5 pr-3 font-medium">{t("check.recall2")}</th>
              <th className="py-1.5 pr-3 font-medium">{t("check.kappa")}</th>
            </tr>
          </thead>
          <tbody>
            {list
              .filter((r) => r.a.n > 0)
              .map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="py-1.5 pr-3 font-medium">{r.name}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{r.a.n}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{pct(r.a.exact)}</td>
                  <td className={`py-1.5 pr-3 tabular-nums ${tone(r.a.precision2)}`}>{pct(r.a.precision2)}</td>
                  <td className={`py-1.5 pr-3 tabular-nums ${tone(r.a.recall2)}`}>{pct(r.a.recall2)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{r.a.kappa === null ? "—" : r.a.kappa.toFixed(2)}</td>
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
        <h1 className="mt-1 font-heading text-3xl font-bold">{t("check.title")}</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">{t("check.subtitle", { n: check.sample.length })}</p>
      </header>
      <div className="space-y-6 px-4 pb-16 md:px-10">
        <p className="text-sm font-medium">{t("check.progress", { done, of: check.sample.length })}</p>
        {next ? (
          <CheckCard key={`${next.runId}:${next.item}`} item={next} />
        ) : (
          <p className="rounded-3xl border bg-card p-4 text-sm">{check.sample.length ? t("check.finished") : t("check.nothing")}</p>
        )}
        {/* Numbers only once every clip is labelled, so they can't sway the labels still to come. */}
        {!next && done > 0 && (
          <>
            <CoversTrial items={check.relevanceItems} />
            <VotesTrial items={check.relevanceItems} />
            <RelevanceTrial final={final} items={check.relevanceItems} />
            <TrialRunner
              version="v4"
              final={final}
              items={check.all
                .filter((s) => s.user !== null)
                .map((s) => ({
                  runId: s.runId,
                  item: s.item,
                  half: s.half,
                  platform: s.platform,
                  thai: looksThai(s.clip.caption),
                  user: s.user!,
                  ai: s.ai,
                  title: s.brief.title,
                  handle: s.clip.handle,
                  caption: s.clip.caption.slice(0, 220),
                }))}
            />
            <p className="text-xs text-muted-foreground">{t("check.bar", { bar: Math.round(AGREEMENT_BAR * 100) })}</p>
            {/* Every clip you labelled blind (the check and the labelling queue), once per brief. */}
            <p className="text-sm font-medium">{t("check.allLabels", { n: check.all.length })}</p>
            {table(t("check.judgeTitle"), splits(check.judgeAll))}
            {table(t("check.filterTitle"), splits(check.filterAll))}
            {check.consistency.length >= 20 ? (
              table(t("check.consistencyTitle"), [{ key: "all", name: t("check.all"), a: agreement(check.consistency) }])
            ) : (
              <p className="text-xs text-muted-foreground">{t("check.consistencyWait", { n: check.consistency.length })}</p>
            )}
            {check.disagreements.length > 0 && (
              <section className="space-y-2 rounded-3xl border bg-card p-4">
                <h2 className="font-heading text-lg font-bold">{t("check.disagreements", { n: check.disagreements.length })}</h2>
                <ul className="space-y-2 text-sm">
                  {check.disagreements.map((d) => (
                    <li key={`${d.runId}:${d.item}`} className="border-t pt-2">
                      <p className="text-xs text-muted-foreground">
                        {d.brief.title} · @{d.clip.handle} · {t("check.youVsAi", { you: d.user!, ai: d.ai })}
                      </p>
                      <p className="line-clamp-2">{d.clip.caption || "—"}</p>
                      <p className="text-xs text-muted-foreground">AI: {d.aiReason}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        {/* S2: what the clips from creators' feeds add, on your labels. */}
        {feeds.length > 0 && (
          <section className="space-y-2 rounded-3xl border bg-card p-4">
            <h2 className="font-heading text-lg font-bold">{t("feeds.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("feeds.hint")}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium" />
                    <th className="py-1.5 pr-3 font-medium">{t("feeds.clips")}</th>
                    <th className="py-1.5 pr-3 font-medium">{t("feeds.labelled")}</th>
                    <th className="py-1.5 pr-3 font-medium">{t("feeds.onTarget")}</th>
                  </tr>
                </thead>
                <tbody>
                  {feeds.map((r) => (
                    <tr key={r.runId} className="border-t">
                      <td className="py-1.5 pr-3 font-medium">{r.title}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.clips}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.labelled}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.labelled ? `${r.onTarget} (${pct(r.onTarget / r.labelled)})` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
