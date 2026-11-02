"use client";

import { FlaskConical, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { type Agreement, AGREEMENT_BAR, agreement, type EvalPlatform, type Label } from "@/lib/eval";
import { trialJudgeAction } from "../actions";

export type TrialItem = {
  runId: string;
  item: string;
  half: "dev" | "test";
  platform: EvalPlatform;
  thai: boolean;
  user: Label;
  /** Today's judge. */
  ai: Label;
  title: string;
  handle: string;
  caption: string;
};

/**
 * Tries the new judge on the clips you labelled blind, without storing anything: today's judge vs the new one on the
 * dev half (what the new judge is tuned on), and the test half only when `final` (measured once, at the end).
 */
export function TrialRunner({ items, version, final }: { items: TrialItem[]; version: string; final: boolean }) {
  const t = useTranslations("eval");
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [trial, setTrial] = useState<Map<string, { label: Label; reason: string }> | null>(null);

  async function run() {
    // One call per research, at most 40 clips each (the judge's list size).
    const calls = [...new Set(items.map((i) => i.runId))].flatMap((runId) => {
      const ids = items.filter((i) => i.runId === runId).map((i) => i.item);
      return Array.from({ length: Math.ceil(ids.length / 40) }, (_, k) => ({ runId, ids: ids.slice(k * 40, (k + 1) * 40) }));
    });
    const out = new Map<string, { label: Label; reason: string }>();
    setProgress({ done: 0, of: calls.length });
    for (const [n, { runId, ids }] of calls.entries()) {
      const res = await trialJudgeAction(runId, ids, version).catch(() => null);
      if (res?.ok) for (const l of res.labels) out.set(`${runId}:${l.item}`, { label: l.label as Label, reason: l.reason });
      else toast.error(t("judgeFailed"));
      setProgress({ done: n + 1, of: calls.length });
    }
    setProgress(null);
    setTrial(out);
  }

  const halves = final ? (["dev", "test"] as const) : (["dev"] as const);
  const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
  const tone = (x: number | null) => (x === null ? "" : x >= AGREEMENT_BAR ? "text-emerald-700" : "text-rose-700");
  const rows = trial
    ? halves.flatMap((h) => {
        const mine = items.filter((i) => i.half === h);
        const pair = (i: TrialItem, other: Label) => ({ platform: i.platform, thai: i.thai, user: i.user, other });
        const tried = mine.filter((i) => trial.has(`${i.runId}:${i.item}`));
        return [
          { key: `${h}-today`, name: t("trial.today", { half: t(`trial.${h}`) }), a: agreement(tried.map((i) => pair(i, i.ai))) },
          { key: `${h}-new`, name: t("trial.new", { half: t(`trial.${h}`), version }), a: agreement(tried.map((i) => pair(i, trial.get(`${i.runId}:${i.item}`)!.label))) },
        ];
      })
    : [];
  const misses = trial ? items.filter((i) => i.half === "dev" && trial.has(`${i.runId}:${i.item}`) && trial.get(`${i.runId}:${i.item}`)!.label !== i.user) : [];
  const cell = (a: Agreement, k: "exact" | "precision2" | "recall2") => <td className={`py-1.5 pr-3 tabular-nums ${k === "exact" ? "" : tone(a[k])}`}>{pct(a[k])}</td>;

  return (
    <section className="space-y-3 rounded-3xl border bg-card p-4">
      <h2 className="font-heading text-lg font-bold">{t("trial.title", { version })}</h2>
      <p className="text-xs text-muted-foreground">{t("trial.hint")}</p>
      <button
        type="button"
        disabled={progress !== null || !items.length}
        onClick={() => void run()}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {progress ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
        {progress ? t("trial.running", { done: progress.done, of: progress.of }) : t("trial.run", { n: items.length })}
      </button>
      {trial && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm" data-trial="results">
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
            <ul className="space-y-2 text-sm" data-trial="misses">
              <li className="text-xs font-medium">{t("trial.misses", { n: misses.length })}</li>
              {misses.map((m) => (
                <li key={`${m.runId}:${m.item}`} className="border-t pt-2">
                  <p className="text-xs text-muted-foreground">
                    {m.title} · @{m.handle} · {t("trial.youVsNew", { you: m.user, now: m.ai, next: trial.get(`${m.runId}:${m.item}`)!.label })}
                  </p>
                  <p className="line-clamp-2">{m.caption || "—"}</p>
                  <p className="text-xs text-muted-foreground">{trial.get(`${m.runId}:${m.item}`)!.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
