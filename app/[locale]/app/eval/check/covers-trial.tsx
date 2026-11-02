"use client";

import { FlaskConical, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { type Agreement, AGREEMENT_BAR, agreement, type Label } from "@/lib/eval";
import type { RelevanceItem } from "@/lib/eval-check";
import { trialRelevanceAction } from "../actions";

const MODES = ["text", "covers"] as const;
type Mode = (typeof MODES)[number];

/**
 * Cover images: every clip you labelled is scored by today's relevance check twice, from the caption alone and from the
 * caption plus the clip's cover, in the same batches of 20. Nothing is stored.
 */
export function CoversTrial({ items }: { items: RelevanceItem[] }) {
  const t = useTranslations("eval");
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [scores, setScores] = useState<Record<Mode, Map<string, Label>> | null>(null);
  const scored = items;

  async function run() {
    const calls = [...new Set(scored.map((i) => i.runId))].flatMap((runId) => {
      const mine = scored.filter((i) => i.runId === runId);
      const ids = mine.map((i) => i.item);
      return MODES.flatMap((mode) => Array.from({ length: Math.ceil(ids.length / 20) }, (_, k) => ({ runId, mode, ids: ids.slice(k * 20, (k + 1) * 20) })));
    });
    const out: Record<Mode, Map<string, Label>> = { text: new Map(), covers: new Map() };
    setProgress({ done: 0, of: calls.length });
    for (const [n, c] of calls.entries()) {
      const res = await trialRelevanceAction(c.runId, c.ids, "v1", [], undefined, c.mode === "covers").catch(() => null);
      if (res?.ok) for (const s of res.scores) out[c.mode].set(`${c.runId}:${s.item}`, s.score as Label);
      else toast.error(t("judgeFailed"));
      setProgress({ done: n + 1, of: calls.length });
    }
    setProgress(null);
    setScores(out);
  }

  const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
  const tone = (x: number | null) => (x === null ? "" : x >= AGREEMENT_BAR ? "text-emerald-700" : "text-rose-700");
  const pair = (i: RelevanceItem, other: Label) => ({ platform: i.platform, thai: i.thai, user: i.user, other });
  const both = scores ? scored.filter((i) => scores.text.has(`${i.runId}:${i.item}`) && scores.covers.has(`${i.runId}:${i.item}`)) : [];
  const groups = [
    { key: "all", name: t("check.all"), list: both },
    { key: "dev", name: t("trial.dev"), list: both.filter((i) => i.half === "dev") },
    { key: "test", name: t("trial.test"), list: both.filter((i) => i.half === "test") },
  ];
  const rows = scores
    ? groups.flatMap((g) => [
        { key: `${g.key}-today`, name: t("coversTrial.today", { group: g.name }), a: agreement(g.list.filter((i) => i.today !== null).map((i) => pair(i, i.today!))) },
        { key: `${g.key}-plain`, name: t("coversTrial.text", { group: g.name }), a: agreement(g.list.map((i) => pair(i, scores.text.get(`${i.runId}:${i.item}`)!))) },
        { key: `${g.key}-votes`, name: t("coversTrial.covers", { group: g.name }), a: agreement(g.list.map((i) => pair(i, scores.covers.get(`${i.runId}:${i.item}`)!))) },
      ])
    : [];
  const cell = (a: Agreement, k: "exact" | "precision2" | "recall2") => <td className={`py-1.5 pr-3 tabular-nums ${k === "exact" ? "" : tone(a[k])}`}>{pct(a[k])}</td>;

  return (
    <section className="space-y-3 rounded-3xl border bg-card p-4">
      <h2 className="font-heading text-lg font-bold">{t("coversTrial.title")}</h2>
      <p className="text-xs text-muted-foreground">{t("coversTrial.hint")}</p>
      <button
        type="button"
        disabled={progress !== null || !scored.length}
        onClick={() => void run()}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {progress ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
        {progress ? t("trial.running", { done: progress.done, of: progress.of }) : t("trial.run", { n: scored.length })}
      </button>
      {scores && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm" data-trial="covers">
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
      )}
    </section>
  );
}
