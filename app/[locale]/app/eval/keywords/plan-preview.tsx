"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { keywordKind } from "@/lib/eval-keywords";
import { previewPlanAction } from "../actions";

export type PreviewBrief = { runId: string; title: string; productName: string; competitors: string[]; keywords: string[]; holdout: boolean };

/**
 * Free preview of the keyword planner on trial (v2, search quality S4): plans every core and hold-out brief again
 * (one AI call each, no credits, nothing stored) and shows the new keywords next to the old ones, each with its kind.
 */
export function PlanPreview({ briefs }: { briefs: PreviewBrief[] }) {
  const t = useTranslations("eval.keywords");
  const locale = useLocale();
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [plans, setPlans] = useState<Map<string, string[] | null> | null>(null);

  async function run() {
    const out = new Map<string, string[] | null>();
    setProgress({ done: 0, of: briefs.length });
    for (const [n, b] of briefs.entries()) {
      const res = await previewPlanAction(b.runId, locale).catch(() => null);
      out.set(b.runId, res?.ok ? res.keywords : null);
      setProgress({ done: n + 1, of: briefs.length });
      setPlans(new Map(out));
    }
    setProgress(null);
  }

  const tagged = (b: PreviewBrief, keywords: string[]) =>
    keywords.map((k) => (
      <li key={k}>
        {k} <span className="text-xs text-muted-foreground">· {t(`kind.${keywordKind(k, b.productName, b.competitors)}`)}</span>
      </li>
    ));

  return (
    <section className="space-y-3 rounded-3xl border bg-card p-4">
      <h2 className="font-heading text-lg font-bold">{t("preview.title")}</h2>
      <p className="text-xs text-muted-foreground">{t("preview.hint")}</p>
      <button
        type="button"
        disabled={progress !== null || !briefs.length}
        onClick={() => void run()}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {progress ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {progress ? t("preview.running", { done: progress.done, of: progress.of }) : t("preview.run", { n: briefs.length })}
      </button>
      {plans && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm" data-preview="plans">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-3 font-medium" />
                <th className="py-1.5 pr-3 font-medium">{t("preview.old")}</th>
                <th className="py-1.5 pr-3 font-medium">{t("preview.new")}</th>
              </tr>
            </thead>
            <tbody>
              {briefs
                .filter((b) => plans.has(b.runId))
                .map((b) => {
                  const fresh = plans.get(b.runId);
                  return (
                    <tr key={b.runId} className="border-t align-top">
                      <td className="py-2 pr-3 font-medium">
                        {b.title}
                        {b.holdout && <span className="ml-1 text-xs text-primary">· {t("preview.holdout")}</span>}
                      </td>
                      <td className="py-2 pr-3">
                        <ul className="space-y-0.5">{tagged(b, b.keywords)}</ul>
                      </td>
                      <td className="py-2 pr-3">
                        {fresh ? <ul className="space-y-0.5">{tagged(b, fresh)}</ul> : <span className="text-xs text-rose-700">{t("preview.failed")}</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
