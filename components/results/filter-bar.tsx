import { ChevronDown } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PlatformIcon } from "@/components/platform-icon";
import { Link } from "@/i18n/navigation";
import { FILTER_PRESETS, type PlatformTab, type ResultFilters, type Sort } from "@/lib/results";

type Params = Record<string, string | undefined>;

function hrefWith(basePath: string, current: Params, changes: Params) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...changes })) if (v) next.set(k, v);
  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** A chip that opens a menu of preset values. Uses <details> so it works without client JS. */
function ChipMenu({
  label,
  activeLabel,
  options,
  stateKey,
}: {
  label: string;
  activeLabel: string | null;
  options: { label: string; href: string; active: boolean }[];
  /** Changes whenever the URL filters change, so the menu remounts closed after a choice. */
  stateKey: string;
}) {
  return (
    <details key={stateKey} className="group relative">
      <summary className={`chip list-none ${activeLabel ? "chip-on" : ""}`}>
        {activeLabel ?? label}
        <ChevronDown className="size-3.5 opacity-60 transition group-open:rotate-180" />
      </summary>
      <div className="absolute z-20 mt-2 min-w-40 rounded-xl border bg-popover p-1 shadow-lg">
        {options.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            scroll={false}
            className={`block rounded-lg px-3 py-1.5 text-sm hover:bg-accent ${o.active ? "font-semibold text-primary" : ""}`}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

export async function FilterBar({
  basePath,
  filters,
  params,
  counts,
}: {
  basePath: string;
  filters: ResultFilters;
  params: Params;
  counts: Record<PlatformTab, number>;
}) {
  const t = await getTranslations("results");
  const format = await getFormatter();
  const compact = (n: number) => format.number(n, { notation: "compact" });

  // Reels only appear when a search included Instagram.
  const tabs: PlatformTab[] = ["all", "tiktok", "youtube", ...(counts.instagram ? (["instagram"] as const) : [])];
  const menu = (key: string, values: readonly number[], current: number | null, fmt: (n: number) => string) => [
    { label: t("any"), href: hrefWith(basePath, params, { [key]: undefined }), active: current === null },
    ...values.map((v) => ({ label: fmt(v), href: hrefWith(basePath, params, { [key]: String(v) }), active: current === v })),
  ];
  const sorts: Sort[] = ["best", "outlier", "views", "saves", "recent"];
  const stateKey = JSON.stringify(params);

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-full bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_2px_6px_rgb(0_0_0/0.06)]">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={hrefWith(basePath, params, { platform: tab === "all" ? undefined : tab })}
            scroll={false}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filters.platform === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab !== "all" && <PlatformIcon platform={tab} className="size-4" />}
            {t(`tab.${tab}`)} <span className="opacity-60">{counts[tab]}</span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("filterBy")}</span>
          <ChipMenu
            stateKey={stateKey}
            label={t("minViews")}
            activeLabel={filters.minViews ? t("viewsPlus", { n: compact(filters.minViews) }) : null}
            options={menu("minViews", FILTER_PRESETS.minViews, filters.minViews, (n) => t("viewsPlus", { n: compact(n) }))}
          />
          <ChipMenu
            stateKey={stateKey}
            label={t("minOutlier")}
            activeLabel={filters.minOutlier ? t("outlierPlus", { n: filters.minOutlier }) : null}
            options={menu("minOutlier", FILTER_PRESETS.minOutlier, filters.minOutlier, (n) => t("outlierPlus", { n }))}
          />
          <ChipMenu
            stateKey={stateKey}
            label={t("minSaves")}
            activeLabel={filters.minSaves ? t("savesPlus", { n: compact(filters.minSaves) }) : null}
            options={menu("minSaves", FILTER_PRESETS.minSaves, filters.minSaves, (n) => t("savesPlus", { n: compact(n) }))}
          />
          <ChipMenu
            stateKey={stateKey}
            label={t("posted")}
            activeLabel={filters.postedDays ? t("lastDays", { n: filters.postedDays }) : null}
            options={menu("posted", FILTER_PRESETS.postedDays, filters.postedDays, (n) => t("lastDays", { n }))}
          />
        </div>
        <ChipMenu
            stateKey={stateKey}
          label={t(`sort.${filters.sort}`)}
          activeLabel={null}
          options={sorts.map((s) => ({
            label: t(`sort.${s}`),
            href: hrefWith(basePath, params, { sort: s === "best" ? undefined : s }),
            active: filters.sort === s,
          }))}
        />
      </div>
    </div>
  );
}
