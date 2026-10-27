import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { isGoal } from "@/lib/goals";
import { createClient } from "@/lib/supabase/server";
import { AddProduct } from "./add-product";
import { ProductCard, type ProductSummary } from "./product-card";

const MAX_PRODUCTS = 5;

/** "My products": what Reely remembers about each product, so a research can start from a chip. */
export default async function ProductPage({ params }: PageProps<"/[locale]/app/product">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("product");
  const format = await getFormatter();
  const supabase = await createClient();
  const [{ data: products }, { data: runs }, { data: plans }] = await Promise.all([
    supabase.from("products").select("id, name, url, description, audience, competitors, language, goal, created_at").order("created_at"),
    supabase.from("research_runs").select("product_id, created_at").not("product_id", "is", null),
    supabase.from("content_plans").select("product_id"),
  ]);
  const usage = new Map<string, { n: number; last: string }>();
  for (const r of runs ?? []) {
    const u = usage.get(r.product_id as string) ?? { n: 0, last: "" };
    u.n++;
    if ((r.created_at as string) > u.last) u.last = r.created_at as string;
    usage.set(r.product_id as string, u);
  }
  const planned = new Set((plans ?? []).map((p) => p.product_id as string));

  // Most recently used first; never-used products last, newest first.
  const list: ProductSummary[] = (products ?? [])
    .map((p) => ({
      id: p.id as string,
      values: {
        name: p.name ?? "",
        url: p.url ?? "",
        description: p.description ?? "",
        audience: p.audience ?? "",
        competitors: ((p.competitors as string[] | null) ?? []).join(", "),
        language: p.language === "en" ? ("en" as const) : ("th" as const),
        goal: isGoal(p.goal) ? p.goal : ("" as const),
      },
      researches: usage.get(p.id as string)?.n ?? 0,
      lastUsed: usage.get(p.id as string) ? format.relativeTime(new Date(usage.get(p.id as string)!.last)) : null,
      hasPlan: planned.has(p.id as string),
      sortKey: usage.get(p.id as string)?.last || `0${p.created_at as string}`,
    }))
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));

  const empty = { name: "", url: "", description: "", audience: "", competitors: "", language: locale === "en" ? "en" : "th", goal: "" } as const;

  return (
    <div>
      <header className="page-wash px-4 md:px-10 pt-10 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
            <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
          </div>
          <p className="text-sm text-muted-foreground">{t("countOf", { n: list.length, max: MAX_PRODUCTS })}</p>
        </div>
      </header>
      <div className="max-w-5xl space-y-5 px-4 md:px-10 pb-16">
        <AddProduct key={list.length} empty={{ ...empty }} disabled={list.length >= MAX_PRODUCTS} startOpen={list.length === 0} />
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyList")}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
