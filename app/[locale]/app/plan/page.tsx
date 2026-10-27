import { CalendarDays, Package, PenLine, Quote } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Thumb } from "@/components/thumb";
import { Link } from "@/i18n/navigation";
import { isGoal } from "@/lib/goals";
import { getPlan } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { PlanBuilder } from "./plan-builder";

/** Building a plan is one AI call that can take ~20-40 s. */
export const maxDuration = 60;

/** "This week's plan": 7 days of posts per product, each from a clip the user liked, saved or researched. */
export default async function PlanPage({ params, searchParams }: PageProps<"/[locale]/app/plan">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("plan");
  const tg = await getTranslations("goals");
  const format = await getFormatter();
  const supabase = await createClient();

  const { data: products } = await supabase.from("products").select("id, name, goal").order("created_at");
  const product = (products ?? []).find((p) => p.id === sp.product) ?? products?.[0] ?? null;
  const plan = product ? await getPlan(supabase, product.id as string) : null;
  const { data: videos } = plan?.items.length
    ? await supabase.from("videos").select("id, thumbnail_url, creator_handle, platform").in("id", plan.items.map((i) => i.videoId))
    : { data: [] };
  const videoOf = new Map((videos ?? []).map((v) => [v.id as number, v]));
  const dayDate = (day: number) => new Date(new Date(`${plan!.startDay}T00:00:00+07:00`).getTime() + (day - 1) * 864e5);
  const goal = product && isGoal(product.goal) ? product.goal : null;

  return (
    <div>
      <header className="page-wash px-4 pt-10 pb-8 md:px-10">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
        {(products?.length ?? 0) > 1 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {products!.map((p) => (
              <Link key={p.id} href={`/app/plan?product=${p.id}`} className={`chip ${p.id === product?.id ? "chip-on" : ""}`}>
                <Package className="size-3.5" /> {p.name}
              </Link>
            ))}
          </div>
        )}
      </header>

      <div className="mx-auto max-w-5xl space-y-4 px-4 pb-16 md:px-10">
        {!product ? (
          <section className="rounded-3xl border bg-card p-8 text-center shadow-sm">
            <p className="text-muted-foreground">{t("noProduct")}</p>
            <Link href="/app/product" className="mt-3 inline-block font-medium text-primary hover:underline">
              {t("addProduct")}
            </Link>
          </section>
        ) : !plan ? (
          <section className="rounded-3xl border bg-card p-8 text-center shadow-sm">
            <CalendarDays className="mx-auto size-8 text-primary" />
            <h2 className="mt-3 font-heading text-xl font-bold">{t("emptyTitle", { product: product.name })}</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{t("emptyHint")}</p>
            <div className="mt-5">
              <PlanBuilder productId={product.id as string} />
            </div>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {t("madeAt", { when: format.relativeTime(new Date(plan.updatedAt)) })}
                {goal && <> · {tg(`${goal}.short`)}</>}
              </p>
              <PlanBuilder productId={product.id as string} again />
            </div>
            {plan.items.map((item) => {
              const v = videoOf.get(item.videoId);
              return (
                <article key={item.day} className="grid gap-4 rounded-3xl border bg-card p-4 shadow-sm sm:grid-cols-[96px_1fr] md:p-5">
                  <Link href={`/app/video/${item.videoId}`} className="relative hidden aspect-[9/14] overflow-hidden rounded-2xl bg-muted sm:block">
                    <Thumb src={(v?.thumbnail_url as string | null) ?? null} videoId={item.videoId} />
                  </Link>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-widest text-primary uppercase">
                      {t("day", { n: item.day })} · {format.dateTime(dayDate(item.day), { weekday: "long", day: "numeric", month: "short" })}
                    </p>
                    <h2 className="mt-1 font-heading text-xl leading-snug font-bold">{item.title}</h2>
                    <p className="mt-2 flex gap-2 rounded-2xl bg-accent px-3 py-2 text-sm text-accent-foreground">
                      <Quote className="mt-0.5 size-4 shrink-0" /> {item.hook}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      <span className="mr-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{item.format}</span>
                      {item.why}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/app/video/${item.videoId}?product=${product.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        <PenLine className="size-4" /> {t("writeScript")}
                      </Link>
                      {v && <span className="text-xs text-muted-foreground">{t("from", { handle: v.creator_handle as string })}</span>}
                    </div>
                  </div>
                </article>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
