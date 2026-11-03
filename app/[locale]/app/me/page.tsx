import { ChevronRight, Info } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformIcon } from "@/components/platform-icon";
import { Link } from "@/i18n/navigation";
import { MAX_PER_PRODUCT } from "@/lib/own-accounts";
import { createClient } from "@/lib/supabase/server";
import { AddChannel, RemoveChannel } from "./channel-controls";

/** My channels: the founder's own public accounts, grouped by product. Opening one refreshes and analyses it. */
export default async function MyChannelsPage({ params }: PageProps<"/[locale]/app/me">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("me");
  const format = await getFormatter();
  const supabase = await createClient();
  const [{ data: products }, { data: accounts }] = await Promise.all([
    supabase.from("products").select("id, name").order("created_at"),
    supabase.from("own_accounts").select("id, product_id, platform, handle").order("added_at"),
  ]);
  const list = (accounts ?? []).map((a) => ({ id: a.id as string, productId: a.product_id as string, platform: a.platform as "tiktok" | "youtube" | "instagram", handle: a.handle as string }));
  const { data: creators } = list.length
    ? await supabase.from("creators").select("platform, handle, followers, usual_views, fetched_at").in("handle", list.map((a) => a.handle))
    : { data: [] };
  const statsOf = new Map((creators ?? []).map((c) => [`${c.platform}:${c.handle}`, c]));
  const productList = (products ?? []).map((p) => ({ id: p.id as string, name: p.name as string }));
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });

  return (
    <div>
      <header className="page-wash px-4 pt-10 pb-8 md:px-10">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
        <p className="mt-3 flex max-w-2xl items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" /> {t("publicNote")}
        </p>
      </header>
      <div className="space-y-8 px-4 pb-16 md:px-10">
        {productList.length === 0 ? (
          <p className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">{t("noProducts")}</p>
        ) : (
          <AddChannel products={productList.map((p) => ({ ...p, full: list.filter((a) => a.productId === p.id).length >= MAX_PER_PRODUCT }))} />
        )}
        {list.length === 0 && productList.length > 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {productList
          .filter((p) => list.some((a) => a.productId === p.id))
          .map((p) => (
            <section key={p.id} className="space-y-3">
              <h2 className="font-heading text-lg font-bold">
                {p.name} <span className="text-sm font-normal text-muted-foreground">({list.filter((a) => a.productId === p.id).length}/{MAX_PER_PRODUCT})</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list
                  .filter((a) => a.productId === p.id)
                  .map((a) => {
                    const s = statsOf.get(`${a.platform}:${a.handle}`);
                    return (
                      <div key={a.id} className="group relative rounded-2xl border bg-card p-4 transition hover:border-primary/40">
                        <Link href={`/app/me/${a.platform}/${encodeURIComponent(a.handle)}`} className="flex items-center gap-3">
                          <PlatformIcon platform={a.platform} className="size-5 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">@{a.handle}</span>
                            <span className="block text-xs text-muted-foreground">
                              {s?.followers ? `${t("followers", { n: compact(s.followers as number) })} · ` : ""}
                              {s?.usual_views ? t("usual", { views: compact(s.usual_views as number) }) : t("notRead")}
                            </span>
                          </span>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </Link>
                        <RemoveChannel id={a.id} />
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
