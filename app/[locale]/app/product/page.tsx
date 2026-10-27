import { ChevronDown, Package, Search } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { isGoal } from "@/lib/goals";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "./product-form";

const MAX_PRODUCTS = 5;

/** "My products": what Reely remembers about each product, so a research can start from a chip. */
export default async function ProductPage({ params }: PageProps<"/[locale]/app/product">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("product");
  const supabase = await createClient();
  const [{ data: products }, { data: runs }] = await Promise.all([
    supabase.from("products").select("id, name, url, description, audience, competitors, language, goal").order("created_at"),
    supabase.from("research_runs").select("product_id").not("product_id", "is", null),
  ]);
  const runCount = new Map<string, number>();
  for (const r of runs ?? []) runCount.set(r.product_id as string, (runCount.get(r.product_id as string) ?? 0) + 1);
  const list = products ?? [];

  return (
    <div>
      <header className="page-wash px-4 md:px-10 pt-10 pb-8">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="max-w-3xl space-y-4 px-4 md:px-10 pb-16">
        {list.map((p) => (
          <details key={p.id} className="group rounded-3xl border bg-card shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground">
                <Package className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-lg font-bold">{p.name}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {p.description || p.url || t("noDescription")}
                </span>
              </span>
              <span className="hidden text-xs text-muted-foreground sm:block">
                {t("researchCount", { n: runCount.get(p.id) ?? 0 })}
              </span>
              <Link
                href={`/app?product=${p.id}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Search className="size-3.5" /> {t("research")}
              </Link>
              <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
            </summary>
            <div className="border-t p-5">
              <ProductForm
                id={p.id}
                initial={{
                  name: p.name ?? "",
                  url: p.url ?? "",
                  description: p.description ?? "",
                  audience: p.audience ?? "",
                  competitors: ((p.competitors as string[] | null) ?? []).join(", "),
                  language: p.language === "en" ? "en" : "th",
                  goal: isGoal(p.goal) ? p.goal : "",
                }}
              />
            </div>
          </details>
        ))}

        {list.length < MAX_PRODUCTS ? (
          <section className="space-y-3 pt-4">
            <h2 className="font-heading text-lg font-bold">{list.length ? t("addAnother") : t("addFirst")}</h2>
            <ProductForm
              initial={{ name: "", url: "", description: "", audience: "", competitors: "", language: locale === "en" ? "en" : "th", goal: "" }}
            />
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">{t("limit")}</p>
        )}
      </div>
    </div>
  );
}
