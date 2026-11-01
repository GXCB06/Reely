"use client";

import { Camera, Copy, Gavel, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { type Summary, summaryMarkdown, TARGETS } from "@/lib/eval";
import { judgeBriefAction, saveSnapshotAction } from "./actions";

type Row = { key: string; name: string; s: Summary };
type Cell = { value: number | null | undefined; target?: number; lowerIsBetter?: boolean; pct?: boolean; digits?: number };

function fmt(c: Cell) {
  if (c.value === null || c.value === undefined) return "—";
  return c.pct ? `${Math.round(c.value * 100)}%` : c.value.toFixed(c.digits ?? 1);
}

function tone(c: Cell) {
  if (c.value === null || c.value === undefined || c.target === undefined) return "";
  const ok = c.lowerIsBetter ? c.value <= c.target : c.value >= c.target;
  return ok ? "text-emerald-700" : "text-rose-700";
}

/** ▲ / ▼ against the last snapshot (green when it moved the right way). */
function Delta({ now, before, lowerIsBetter }: { now: number | null | undefined; before: number | null | undefined; lowerIsBetter?: boolean }) {
  if (now === null || now === undefined || before === null || before === undefined || Math.abs(now - before) < 1e-9) return null;
  const up = now > before;
  const good = lowerIsBetter ? !up : up;
  return <span className={`ml-1 text-[10px] ${good ? "text-emerald-600" : "text-rose-600"}`}>{up ? "▲" : "▼"}</span>;
}

/**
 * The metric table (all briefs, Thai, worldwide, both) with v0.2 targets, the last snapshot to compare with, and the
 * buttons to judge every unjudged brief, save a snapshot and copy the table as Markdown.
 */
export function EvalSummary({
  rows,
  last,
  unjudged,
  all,
}: {
  rows: Row[];
  last: { note: string | null; createdAt: string; all: Summary | null } | null;
  unjudged: string[];
  /** Every brief in the set, for "judge all again" (after the judge itself changes). */
  all: string[];
}) {
  const t = useTranslations("eval");
  const router = useRouter();
  const [note, setNote] = useState("");
  const [saving, startSave] = useTransition();
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);

  const columns = (s: Summary): Cell[] => [
    { value: s.precision10.tiktok, target: TARGETS.precision10.tiktok, pct: true },
    { value: s.precision10.youtube, target: TARGETS.precision10.youtube, pct: true },
    { value: s.precision10.instagram, target: TARGETS.precision10.instagram, pct: true },
    { value: s.creatorPrecision5, target: TARGETS.creatorPrecision5, pct: true },
    { value: s.igCoverage, target: TARGETS.igCoverage },
    { value: s.diversity, target: TARGETS.diversity, lowerIsBetter: true, pct: true },
    { value: s.costPerUseful, lowerIsBetter: true },
    { value: s.seconds, digits: 0, lowerIsBetter: true },
  ];
  const head = [t("col.p10", { p: "TikTok" }), t("col.p10", { p: "YouTube" }), t("col.p10", { p: "IG" }), t("col.creators"), t("col.igUseful"), t("col.diversity"), t("col.cost"), t("col.seconds")];
  const lastCols = last?.all ? columns(last.all) : null;

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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium" />
              <th className="py-1.5 pr-3 font-medium">{t("col.briefs")}</th>
              {head.map((h) => (
                <th key={h} className="py-1.5 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="py-1.5 pr-3 font-medium">{r.name}</td>
                <td className="py-1.5 pr-3">{r.s.briefs}</td>
                {columns(r.s).map((c, i) => (
                  <td key={i} className={`py-1.5 pr-3 tabular-nums ${tone(c)}`}>
                    {fmt(c)}
                    {r.key === "all" && lastCols && <Delta now={c.value} before={lastCols[i].value} lowerIsBetter={c.lowerIsBetter} />}
                  </td>
                ))}
              </tr>
            ))}
            {lastCols && (
              <tr className="border-t text-muted-foreground">
                <td className="py-1.5 pr-3 text-xs">{t("lastSnapshot", { note: last?.note ?? "—" })}</td>
                <td className="py-1.5 pr-3 text-xs">{last?.all?.briefs}</td>
                {lastCols.map((c, i) => (
                  <td key={i} className="py-1.5 pr-3 text-xs tabular-nums">
                    {fmt(c)}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
      </div>
    </section>
  );
}
