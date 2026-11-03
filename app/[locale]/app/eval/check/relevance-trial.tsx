"use client";

import { FlaskConical, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { type Agreement, AGREEMENT_BAR, agreement, type Label } from "@/lib/eval";
import type { RelevanceItem } from "@/lib/eval-check";
import { trialRelevanceAction } from "../actions";

const VERSIONS = ["v1", "v4"] as const;
type Version = (typeof VERSIONS)[number];
/** The models a trial may run on (TRIAL_MODELS in lib/ai/model.ts): both versions always run on the one picked. */
const MODELS = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest"] as const;

/**
 * Tries the search's relevance check v4 (pain-only clips are 1, search quality S4b) on every clip you labelled, without
 * storing anything: today's stored score, v1 scored again on the same single model, and v4, on the dev briefs, and on
 * the test briefs only when `final`.
 */
export function RelevanceTrial({ items, final }: { items: RelevanceItem[]; final: boolean }) {
  const t = useTranslations("eval");
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [scores, setScores] = useState<Record<Version, Map<string, Label>> | null>(null);
  const [model, setModel] = useState<(typeof MODELS)[number]>(MODELS[0]);

  async function run() {
    const calls = [...new Set(items.map((i) => i.runId))].flatMap((runId) => {
      const ids = items.filter((i) => i.runId === runId).map((i) => i.item);
      return VERSIONS.flatMap((version) => Array.from({ length: Math.ceil(ids.length / 80) }, (_, k) => ({ runId, version, ids: ids.slice(k * 80, (k + 1) * 80) })));
    });
    const out: Record<Version, Map<string, Label>> = { v1: new Map(), v4: new Map() };
    setProgress({ done: 0, of: calls.length });
    for (const [n, c] of calls.entries()) {
      // A busy model fails a batch now and then: one more try before it counts as missing.
      const ask = () => trialRelevanceAction(c.runId, c.ids, c.version, [], null, false, model).catch(() => null);
      const first = await ask();
      const res = first?.ok ? first : await ask();
      if (res?.ok) for (const s of res.scores) out[c.version].set(`${c.runId}:${s.item}`, s.score as Label);
      else toast.error(t("judgeFailed"));
      setProgress({ done: n + 1, of: calls.length });
    }
    setProgress(null);
    setScores(out);
  }

  const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
  const tone = (x: number | null) => (x === null ? "" : x >= AGREEMENT_BAR ? "text-emerald-700" : "text-rose-700");
  const halves = final ? (["dev", "test"] as const) : (["dev"] as const);
  const pair = (i: RelevanceItem, other: Label) => ({ platform: i.platform, thai: i.thai, user: i.user, other });
  const rows = scores
    ? halves.flatMap((h) => {
        const mine = items.filter((i) => i.half === h && scores.v1.has(`${i.runId}:${i.item}`) && scores.v4.has(`${i.runId}:${i.item}`));
        return [
          { key: `${h}-today`, name: t("relTrial.today", { half: t(`trial.${h}`) }), a: agreement(mine.filter((i) => i.today !== null).map((i) => pair(i, i.today!))) },
          ...VERSIONS.map((v) => ({ key: `${h}-${v}`, name: t("relTrial.version", { version: v, half: t(`trial.${h}`) }), a: agreement(mine.map((i) => pair(i, scores[v].get(`${i.runId}:${i.item}`)!))) })),
        ];
      })
    : [];
  const misses = scores ? items.filter((i) => i.half === "dev" && scores.v4.has(`${i.runId}:${i.item}`) && scores.v4.get(`${i.runId}:${i.item}`) !== i.user) : [];
  const cell = (a: Agreement, k: "exact" | "precision2" | "recall2") => <td className={`py-1.5 pr-3 tabular-nums ${k === "exact" ? "" : tone(a[k])}`}>{pct(a[k])}</td>;

  return (
    <section className="space-y-3 rounded-3xl border bg-card p-4">
      <h2 className="font-heading text-lg font-bold">{t("relTrial.title")}</h2>
      <p className="text-xs text-muted-foreground">{t("relTrial.hint")}</p>
      <label className="flex items-center gap-2 text-xs">
        {t("relTrial.model")}
        <select
          value={model}
          disabled={progress !== null}
          onChange={(e) => setModel(e.target.value as (typeof MODELS)[number])}
          data-trial="model"
          className="rounded-full border bg-background px-2 py-1"
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={progress !== null || !items.length}
        onClick={() => void run()}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {progress ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
        {progress ? t("trial.running", { done: progress.done, of: progress.of }) : t("trial.run", { n: items.length })}
      </button>
      {scores && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm" data-trial="relevance">
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
                {rows.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="py-1.5 pr-3 font-medium">{r.name}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.a.n}</td>
                    {cell(r.a, "exact")}
                    {cell(r.a, "precision2")}
                    {cell(r.a, "recall2")}
                    <td className="py-1.5 pr-3 tabular-nums">{r.a.kappa === null ? "—" : r.a.kappa.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {misses.length > 0 && (
            <ul className="space-y-2 text-sm" data-trial="relevance-misses">
              <li className="text-xs font-medium">{t("relTrial.misses", { n: misses.length })}</li>
              {misses.map((m) => (
                <li key={`${m.runId}:${m.item}`} className="border-t pt-2">
                  <p className="text-xs text-muted-foreground">
                    {m.product} · @{m.handle} · {t("relTrial.youVs", { you: m.user, today: m.today ?? "—", v1: scores.v1.get(`${m.runId}:${m.item}`) ?? "—", v4: scores.v4.get(`${m.runId}:${m.item}`) ?? "—" })}
                  </p>
                  <p className="line-clamp-2">{m.caption || "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
