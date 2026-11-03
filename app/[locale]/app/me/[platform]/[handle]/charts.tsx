import { getFormatter, getTranslations } from "next-intl/server";
import type { CompareRow, GroupRow, TimelinePoint } from "@/lib/account-analysis";
import { formatMultiplier } from "@/lib/scoring";

// My channels charts (v0.3 round 2): hand-drawn SVG, server-rendered, theme colours only. One axis per chart, thin
// marks, numbers always written next to the marks, and a legend whenever two kinds of mark share a chart.

const W = 640;

/** Every post as a dot (date across, views up on a log scale), hits in the primary colour, your usual as a dashed line. */
export async function Timeline({ points, usual, hrefOf }: { points: TimelinePoint[]; usual: number | null; hrefOf: (id: string) => string }) {
  const t = await getTranslations("me.charts");
  const format = await getFormatter();
  if (points.length < 2) return <p className="text-sm text-muted-foreground">{t("timelineEmpty")}</p>;
  const H = 200;
  const pad = { l: 44, r: 12, t: 10, b: 22 };
  const t0 = points[0].t;
  const t1 = points.at(-1)!.t;
  const logs = points.map((p) => Math.log10(Math.max(p.views, 1)));
  const lo = Math.floor(Math.min(...logs));
  const hi = Math.max(Math.ceil(Math.max(...logs)), lo + 1);
  const x = (time: number) => pad.l + ((time - t0) / Math.max(t1 - t0, 1)) * (W - pad.l - pad.r);
  const y = (views: number) => pad.t + (1 - (Math.log10(Math.max(views, 1)) - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const day = (time: number) => format.dateTime(new Date(time), { day: "numeric", month: "short" });
  const decades = Array.from({ length: hi - lo + 1 }, (_, i) => 10 ** (lo + i));

  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("timelineLabel", { n: points.length })}>
        {decades.map((d) => (
          <g key={d}>
            <line x1={pad.l} x2={W - pad.r} y1={y(d)} y2={y(d)} className="stroke-border" strokeWidth={1} />
            <text x={pad.l - 6} y={y(d) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {compact(d)}
            </text>
          </g>
        ))}
        {usual !== null && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(usual)} y2={y(usual)} className="stroke-foreground/50" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={W - pad.r} y={y(usual) - 5} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {t("usualLine", { views: compact(usual) })}
            </text>
          </g>
        )}
        {points.map((p) => (
          <a key={p.id} href={hrefOf(p.id)}>
            <title>{`${day(p.t)} · ${compact(p.views)}${p.x !== null ? ` · ${formatMultiplier(p.x)}×` : ""}`}</title>
            {/* A larger invisible target than the dot, so small dots are easy to hover and tap. */}
            <circle cx={x(p.t)} cy={y(p.views)} r={9} fill="transparent" />
            <circle
              cx={x(p.t)}
              cy={y(p.views)}
              r={4.5}
              className={p.hit ? "fill-primary stroke-card" : "fill-muted-foreground/45 stroke-card"}
              strokeWidth={1.5}
            />
          </a>
        ))}
        <text x={pad.l} y={H - 4} className="fill-muted-foreground text-[11px]">
          {day(t0)}
        </text>
        <text x={W - pad.r} y={H - 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
          {day(t1)}
        </text>
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary" /> {t("legendHit")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/45" /> {t("legendOther")}
        </span>
        {usual !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-foreground/50" /> {t("legendUsual")}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * Groups of posts (formats, hook types, lengths) as horizontal bars of their median multiplier, with a line at 1×
 * (your usual). Numbers are written on every row; groups too small to tell are greyed and say so.
 */
export async function GroupBars({ title, rows, nameOf }: { title: string; rows: GroupRow[]; nameOf: (key: string) => string }) {
  const t = await getTranslations("me.charts");
  if (!rows.length) return null;
  const max = Math.max(2, ...rows.filter((r) => r.enough).map((r) => r.medianX ?? 0));
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className={`grid grid-cols-[minmax(84px,120px)_1fr] items-center gap-2 text-xs ${r.enough ? "" : "opacity-55"}`}>
            <span className="truncate">{nameOf(r.key)}</span>
            <span className="space-y-0.5">
              <span className="relative block h-2.5 rounded-full bg-muted">
                <span className={`absolute inset-y-0 left-0 rounded-full ${r.enough ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ width: pct(r.medianX ?? 0) }} />
                {/* Your usual (1×). */}
                <span className="absolute inset-y-[-3px] w-0.5 bg-foreground/60" style={{ left: pct(1) }} />
              </span>
              <span className="block text-muted-foreground tabular-nums">
                {r.enough
                  ? t("groupLine", { x: r.medianX !== null ? formatMultiplier(r.medianX) : "—", hits: Math.round((r.hitRate ?? 0) * 100), n: r.posts })
                  : t("tooFew", { n: r.posts })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Your channel next to the accounts you track: four numbers each, with an inline bar against the row's best. */
export async function CompareTable({ rows, updatedOf }: { rows: CompareRow[]; updatedOf: (handle: string) => string | null }) {
  const t = await getTranslations("me.charts");
  const format = await getFormatter();
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const metrics: { key: string; value: (r: CompareRow) => number | null; show: (v: number) => string }[] = [
    { key: "usual", value: (r) => r.usual, show: compact },
    { key: "hitRate", value: (r) => r.hitRate, show: (v) => `${Math.round(v * 100)}%` },
    { key: "perWeek", value: (r) => r.postsPerWeek, show: (v) => String(v) },
    { key: "engagement", value: (r) => r.engagement, show: (v) => `${(v * 100).toFixed(1)}%` },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm" data-me="compare">
        <thead>
          <tr className="text-left text-xs">
            <th className="py-1.5 pr-3 font-medium text-muted-foreground" />
            {rows.map((r) => (
              <th key={r.handle} className={`py-1.5 pr-3 font-semibold ${r.own ? "text-primary" : ""}`}>
                @{r.handle}
                {r.own && <span className="ml-1 font-normal text-muted-foreground">({t("you")})</span>}
                {updatedOf(r.handle) && <span className="block font-normal text-muted-foreground">{updatedOf(r.handle)}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => {
            const best = Math.max(0, ...rows.map((r) => m.value(r) ?? 0));
            return (
              <tr key={m.key} className="border-t">
                <td className="py-2 pr-3 text-xs text-muted-foreground">{t(`metric.${m.key}`)}</td>
                {rows.map((r) => {
                  const v = m.value(r);
                  return (
                    <td key={r.handle} className={`py-2 pr-3 ${r.own ? "bg-primary/5" : ""}`}>
                      <span className="block tabular-nums">{v === null ? "—" : m.show(v)}</span>
                      {v !== null && best > 0 && (
                        <span className="mt-1 block h-1.5 rounded-full bg-muted">
                          <span className={`block h-1.5 rounded-full ${r.own ? "bg-primary" : "bg-foreground/35"}`} style={{ width: `${(v / best) * 100}%` }} />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One measure week by week as a small line (followers, or usual views): one series, one axis. */
export async function WeekLine({ title, points }: { title: string; points: { week: string; value: number | null }[] }) {
  const format = await getFormatter();
  const shown = points.filter((p): p is { week: string; value: number } => p.value !== null);
  if (shown.length < 2) return null;
  const H = 90;
  const pad = { l: 8, r: 8, t: 14, b: 18 };
  const vals = shown.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const x = (i: number) => pad.l + (i / (shown.length - 1)) * (320 - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / Math.max(hi - lo, 1)) * (H - pad.t - pad.b);
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const week = (w: string) => format.dateTime(new Date(`${w}T00:00:00Z`), { day: "numeric", month: "short" });
  const last = shown.at(-1)!;
  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground tabular-nums">· {compact(last.value)}</span>
      </figcaption>
      <svg viewBox={`0 0 320 ${H}`} className="h-auto w-full max-w-sm" role="img" aria-label={`${title}: ${shown.map((p) => `${week(p.week)} ${compact(p.value)}`).join(", ")}`}>
        <polyline points={shown.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" className="stroke-primary" strokeWidth={2} />
        {shown.map((p, i) => (
          <circle key={p.week} cx={x(i)} cy={y(p.value)} r={4} className="fill-primary stroke-card" strokeWidth={1.5}>
            <title>{`${week(p.week)}: ${compact(p.value)}`}</title>
          </circle>
        ))}
        <text x={pad.l} y={H - 3} className="fill-muted-foreground text-[11px]">
          {week(shown[0].week)}
        </text>
        <text x={320 - pad.r} y={H - 3} textAnchor="end" className="fill-muted-foreground text-[11px]">
          {week(last.week)}
        </text>
      </svg>
    </figure>
  );
}
