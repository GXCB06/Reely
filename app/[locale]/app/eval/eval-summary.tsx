"use client";

import { Camera, Copy, Gavel, ListChecks, Loader2, PenLine, Shuffle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { type Summary, summaryMarkdown } from "@/lib/eval";
import { judgeBriefAction, saveSnapshotAction } from "./actions";
import { type MetricRow, MetricTable } from "./metric-table";

/**
 * The metric table (all briefs, Thai, worldwide, both) with v0.2 targets, the last snapshot to compare with, and the
 * buttons to judge every unjudged brief, save a snapshot and copy the table as Markdown.
 */
export function EvalSummary({
  rows,
  last,
  unjudged,
  all,
  agreementLine,
}: {
  rows: MetricRow[];
  last: { note: string | null; createdAt: string; all: Summary | null } | null;
  unjudged: string[];
  /** Every brief in the set, for "judge all again" (after the judge itself changes). */
  all: string[];
  /** How far the AI judge agrees with your blind labels, once you have done the check. */
  agreementLine: string | null;
}) {
  const t = useTranslations("eval");
  const router = useRouter();
  const [note, setNote] = useState("");
  const [saving, startSave] = useTransition();
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);

  async function judgeAll(ids: string[]) {
    setProgress({ done: 0, of: ids.length });
    for (const [i, id] of ids.entries()) {
      const res = await judgeBriefAction(id).catch(() => null);
      if (!res?.ok) toast.error(t("judgeFailed"));
      setProgress({ done: i + 1, of: ids.length });
    }
    setProgress(null);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-3xl border bg-card p-4">
      <MetricTable
        rows={rows}
        compare={last?.all ? { keys: ["all"], against: last.all } : undefined}
        reference={last?.all ? { name: t("lastSnapshot", { note: last.note ?? "—" }), s: last.all } : undefined}
      />
      {agreementLine && <p className="text-xs">{agreementLine}</p>}
      <p className="text-xs text-muted-foreground">{t("targetsHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!unjudged.length || progress !== null}
          onClick={() => void judgeAll(unjudged)}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {progress ? <Loader2 className="size-3.5 animate-spin" /> : <Gavel className="size-3.5" />}
          {progress ? t("judgingAll", { done: progress.done, of: progress.of }) : t("judgeAll", { n: unjudged.length })}
        </button>
        <button
          type="button"
          disabled={!all.length || progress !== null}
          onClick={() => window.confirm(t("judgeAgainConfirm", { n: all.length })) && void judgeAll(all)}
          className="chip"
        >
          <Gavel className="size-3.5" /> {t("judgeAllAgain", { n: all.length })}
        </button>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={120}
          placeholder={t("snapshotNote")}
          className="h-8 w-48 rounded-full border bg-background px-3 text-xs outline-none"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            startSave(async () => {
              const all = rows.find((r) => r.key === "all")?.s ?? null;
              const res = await saveSnapshotAction(note, { all, groups: Object.fromEntries(rows.map((r) => [r.key, r.s])) });
              if (!res.ok) return void toast.error(t("snapshotFailed"));
              toast.success(t("snapshotSaved"));
              setNote("");
              router.refresh();
            })
          }
          className="chip"
        >
          <Camera className="size-3.5" /> {t("saveSnapshot")}
        </button>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard
              .writeText(summaryMarkdown(rows.map((r) => ({ name: r.name, s: r.s }))))
              .then(() => toast.success(t("copied")), () => toast.error(t("copyFailed")))
          }
          className="chip"
        >
          <Copy className="size-3.5" /> {t("copyMarkdown")}
        </button>
        <Link href="/app/eval/replay" className="chip">
          <Shuffle className="size-3.5" /> {t("replay.open")}
        </Link>
        <Link href="/app/eval/label" className="chip">
          <PenLine className="size-3.5" /> {t("label.open")}
        </Link>
        <Link href="/app/eval/check" className="chip">
          <ListChecks className="size-3.5" /> {t("check.open")}
        </Link>
      </div>
    </section>
  );
}
