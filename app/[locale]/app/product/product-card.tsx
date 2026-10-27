"use client";

import { CalendarDays, Globe, Package, Pencil, Search, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import type { Goal } from "@/lib/goals";
import type { ProductForm as Values } from "./actions";
import { ProductForm } from "./product-form";

export type ProductSummary = {
  id: string;
  values: Values;
  researches: number;
  /** "3 days ago", already formatted by the page. */
  lastUsed: string | null;
  hasPlan: boolean;
};

/** One saved product: what Reely knows at a glance, the next steps, and an inline editor. */
export function ProductCard({ product }: { product: ProductSummary }) {
  const t = useTranslations("product");
  const tg = useTranslations("goals");
  const [editing, setEditing] = useState(false);
  const v = product.values;
  const competitors = v.competitors.split(",").map((c) => c.trim()).filter(Boolean);
  let host: string | null = null;
  try {
    host = v.url ? new URL(v.url).hostname.replace(/^www\./, "") : null;
  } catch {
    host = v.url || null;
  }

  return (
    <article className={`flex flex-col rounded-3xl border bg-card p-5 shadow-sm ${editing ? "md:col-span-2" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground">
          <Package className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-lg font-bold">{v.name}</h2>
          <p className="text-xs text-muted-foreground">
            {t("researchCount", { n: product.researches })}
            {product.lastUsed && <> · {t("lastUsed", { when: product.lastUsed })}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-label={editing ? t("close") : t("edit")}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {editing ? <X className="size-3.5" /> : <Pencil className="size-3.5" />} {editing ? t("close") : t("edit")}
        </button>
      </div>

      {editing ? (
        <div className="mt-4 border-t pt-4">
          <ProductForm id={product.id} initial={v} onDone={() => setEditing(false)} />
        </div>
      ) : (
        <>
          <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{v.description || t("noDescription")}</p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            {v.goal && <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">{tg(`${v.goal as Goal}.label`)}</span>}
            {v.audience && (
              <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-muted px-2.5 py-1">
                <Users className="size-3 shrink-0" /> <span className="truncate">{v.audience}</span>
              </span>
            )}
            {host && (
              <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 hover:underline">
                <Globe className="size-3" /> {host}
              </a>
            )}
          </div>
          {competitors.length > 0 && (
            <p className="mt-2 truncate text-xs text-muted-foreground">
              {t("vs")} {competitors.join(" · ")}
            </p>
          )}
          {!v.goal && !v.audience && <p className="mt-2 text-xs text-amber-700">{t("incomplete")}</p>}
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <Link
              href={`/app?product=${product.id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Search className="size-3.5" /> {t("research")}
            </Link>
            <Link href={`/app/plan?product=${product.id}`} className="inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm hover:bg-muted">
              <CalendarDays className="size-3.5" /> {product.hasPlan ? t("openPlan") : t("makePlan")}
            </Link>
          </div>
        </>
      )}
    </article>
  );
}
