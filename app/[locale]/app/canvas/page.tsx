import { LayoutTemplate } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { parseInputs } from "@/lib/canvas";
import { createClient } from "@/lib/supabase/server";
import { DeleteCanvas, NewCanvas } from "./canvas-list-controls";

/** Content Canvas boards, grouped by product, newest first. */
export default async function CanvasListPage({ params }: PageProps<"/[locale]/app/canvas">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("canvas");
  const format = await getFormatter();
  const supabase = await createClient();
  const [{ data: products }, { data: canvases }] = await Promise.all([
    supabase.from("products").select("id, name").order("created_at"),
    supabase.from("canvases").select("id, title, product_id, inputs, updated_at, canvas_outputs(count)").order("updated_at", { ascending: false }),
  ]);
  const list = (canvases ?? []).map((c) => ({
    id: c.id as string,
    title: (c.title as string) || t("untitled"),
    productId: c.product_id as string,
    clips: parseInputs(c.inputs).clips.length,
    versions: ((c.canvas_outputs as { count: number }[] | null)?.[0]?.count ?? 0) as number,
    updatedAt: c.updated_at as string,
  }));
  const productList = (products ?? []).map((p) => ({ id: p.id as string, name: p.name as string }));

  return (
    <div>
      <header className="page-wash px-4 pt-10 pb-8 md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
            <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
          </div>
          {productList.length > 0 && <NewCanvas products={productList} />}
        </div>
      </header>
      <div className="space-y-8 px-4 pb-16 md:px-10">
        {productList.length === 0 ? (
          <p className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">
            {t("noProducts")}{" "}
            <Link href="/app" className="text-primary hover:underline">
              →
            </Link>
          </p>
        ) : list.length === 0 ? (
          <p className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          productList
            .filter((p) => list.some((c) => c.productId === p.id))
            .map((p) => (
              <section key={p.id} className="space-y-3">
                <h2 className="font-heading text-lg font-bold">{p.name}</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {list
                    .filter((c) => c.productId === p.id)
                    .map((c) => (
                      <div key={c.id} className="group relative rounded-2xl border bg-card p-4 transition hover:border-primary/40">
                        <Link href={`/app/canvas/${c.id}`} className="flex items-start gap-3">
                          <LayoutTemplate className="mt-0.5 size-5 shrink-0 text-primary" />
                          <span className="min-w-0">
                            <span className="line-clamp-2 font-medium">{c.title}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {t("clips", { n: c.clips })} · {t("versionsN", { n: c.versions })} · {format.relativeTime(new Date(c.updatedAt))}
                            </span>
                          </span>
                        </Link>
                        <DeleteCanvas id={c.id} />
                      </div>
                    ))}
                </div>
              </section>
            ))
        )}
      </div>
    </div>
  );
}
