import { useTranslations } from "next-intl";
import { type Summary, TARGETS } from "@/lib/eval";

export type MetricRow = { key: string; name: string; s: Summary };
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

/** ▲ / ▼ against a reference row (green when it moved the right way). */
function Delta({ now, before, lowerIsBetter }: { now: number | null | undefined; before: number | null | undefined; lowerIsBetter?: boolean }) {
  if (now === null || now === undefined || before === null || before === undefined || Math.abs(now - before) < 1e-9) return null;
  const up = now > before;
  const good = lowerIsBetter ? !up : up;
  return <span className={`ml-1 text-[10px] ${good ? "text-emerald-600" : "text-rose-600"}`}>{up ? "▲" : "▼"}</span>;
}

const columns = (s: Summary): Cell[] => [
  { value: s.precision10.tiktok, target: TARGETS.precision10.tiktok, pct: true },
  { value: s.precision10.youtube, target: TARGETS.precision10.youtube, pct: true },
  { value: s.precision10.instagram, target: TARGETS.precision10.instagram, pct: true },
  { value: s.creatorPrecision5, target: TARGETS.creatorPrecision5, pct: true },
  { value: s.igCoverage, target: TARGETS.igCoverage },
  { value: s.diversity, target: TARGETS.diversity, lowerIsBetter: true, pct: true },
  { value: s.costPerUseful, lowerIsBetter: true },
  { value: s.seconds, digits: 0, lowerIsBetter: true },
  { value: s.clips, digits: 0 },
];

/**
 * The test-set metric table with the v0.2 targets (green met, red not). `compare` marks which rows get ▲ / ▼ and against
 * what: the last snapshot on the main page, today's order on the replay page. `reference` is an extra grey row.
 */
export function MetricTable({
  rows,
  compare,
  reference,
}: {
  rows: MetricRow[];
  compare?: { keys: string[]; against: Summary };
  reference?: { name: string; s: Summary };
}) {
  const t = useTranslations("eval");
  const head = [
    t("col.p10", { p: "TikTok" }),
    t("col.p10", { p: "YouTube" }),
    t("col.p10", { p: "IG" }),
    t("col.creators"),
    t("col.igUseful"),
    t("col.diversity"),
    t("col.cost"),
    t("col.seconds"),
    t("col.clips"),
  ];
  const against = compare ? columns(compare.against) : null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
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
                  {against && compare!.keys.includes(r.key) && <Delta now={c.value} before={against[i].value} lowerIsBetter={c.lowerIsBetter} />}
                </td>
              ))}
            </tr>
          ))}
          {reference && (
            <tr className="border-t text-muted-foreground">
              <td className="py-1.5 pr-3 text-xs">{reference.name}</td>
              <td className="py-1.5 pr-3 text-xs">{reference.s.briefs}</td>
              {columns(reference.s).map((c, i) => (
                <td key={i} className="py-1.5 pr-3 text-xs tabular-nums">
                  {fmt(c)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
