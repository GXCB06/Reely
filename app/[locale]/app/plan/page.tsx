import { CalendarDays, Package } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { isGoal } from "@/lib/goals";
import { getPlan } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { PlanBuilder } from "./plan-builder";
import { type PlanDay, PlanDays } from "./plan-days";

/** Building a plan is one AI call that can take ~20-40 s. */
export const maxDuration = 60;

/** Today's date in Thailand, as YYYY-MM-DD. */
const thaiToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

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
    ? await supabase
        .from("videos")
        .select("id, thumbnail_url, creator_handle, platform, platform_video_id, url")
        .in("id", plan.items.map((i) => i.videoId))
    : { data: [] };
  const videoOf = new Map((videos ?? []).map((v) => [v.id as number, v]));
  const dayDate = (day: number) => new Date(new Date(`${plan!.startDay}T00:00:00+07:00`).getTime() + (day - 1) * 864e5);
  const dayKey = (day: number) => new Date(dayDate(day).getTime() + 7 * 3600e3).toISOString().slice(0, 10);
  const today = thaiToday();
  const todayDay = plan?.items.find((i) => dayKey(i.day) === today)?.day ?? null;
  // The plan's week is over: offer a fresh one first.
  const outdated = !!plan?.items.length && dayKey(Math.max(...plan.items.map((i) => i.day))) < today;
  const goal = product && isGoal(product.goal) ? product.goal : null;

  return (
    <div>
      <header className="page-wash px-4 pt-8 pb-6 md:px-10">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
        {(products?.length ?? 0) > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-sm text-muted-foreground">{t("planFor")}</span>
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
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-heading text-2xl font-bold">{t("planTitle", { product: product.name as string })}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("madeAt", { when: format.relativeTime(new Date(plan.updatedAt)) })}
                  {goal && <> · {tg(`${goal}.short`)}</>}
                </p>
              </div>
              <PlanBuilder productId={product.id as string} again />
            </div>

            {outdated && (
              <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{t("outdated")}</p>
            )}

            <PlanDays
              key={product.id as string}
              productId={product.id as string}
              days={plan.items.map((item) => {
                const v = videoOf.get(item.videoId);
                return {
                  day: item.day,
                  weekday: format.dateTime(dayDate(item.day), { weekday: "short" }),
                  dayNum: format.dateTime(dayDate(item.day), { day: "numeric" }),
                  longDate: format.dateTime(dayDate(item.day), { weekday: "long", day: "numeric", month: "short" }),
                  isToday: item.day === todayDay,
                  title: item.title,
                  hook: item.hook,
                  format: item.format,
                  why: item.why,
                  videoId: item.videoId,
                  thumbnailUrl: (v?.thumbnail_url as string | null) ?? null,
                  handle: (v?.creator_handle as string | null) ?? null,
                  platform: (v?.platform as PlanDay["platform"]) ?? null,
                  platformVideoId: (v?.platform_video_id as string | null) ?? null,
                  url: (v?.url as string | null) ?? null,
                };
              })}
            />
          </>
        )}
      </div>
    </div>
  );
}
