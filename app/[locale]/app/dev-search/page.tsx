import { Search } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OutlierCard } from "@/components/outlier-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fixturesEnabled } from "@/lib/env";
import { searchKeyword } from "@/lib/search";

// Day 1 test page: one keyword → TikTok + YouTube → ranked by outlier score.
export default async function DevSearchPage({ params, searchParams }: PageProps<"/[locale]/app/dev-search">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("search");
  const q = (await searchParams).q;
  const keyword = typeof q === "string" ? q.trim() : "";
  const result = keyword ? await searchKeyword(keyword) : null;

  return (
    <div>
      <header className="page-wash px-10 pt-10 pb-8">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        <form className="mt-6 flex max-w-xl gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={keyword}
              placeholder={t("placeholder")}
              className="h-11 rounded-full bg-white pl-9 shadow-sm"
            />
          </div>
          <Button type="submit" className="h-11 rounded-full px-6">
            {t("button")}
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">{fixturesEnabled() ? t("fixtures") : t("live")}</p>
      </header>

      {result && (
        <section className="px-10 pb-12">
          {result.errors.length > 0 && (
            <ul className="mb-4 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {result.hidden > 0 && (
            <p className="mb-4 text-xs text-muted-foreground">{t("hiddenByFilter", { count: result.hidden })}</p>
          )}
          {result.videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {result.videos.map((v) => (
                <OutlierCard key={`${v.platform}:${v.platformVideoId}`} video={v} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
