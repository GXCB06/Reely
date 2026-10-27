import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { OutlierCard } from "@/components/outlier-card";
import { KpiTiles, MonthBars, profileUrl } from "@/components/tracking/account-row";
import { Link } from "@/i18n/navigation";
import { loadAccount } from "@/lib/tracking";

export default async function AccountPage({ params }: PageProps<"/[locale]/app/tracking/[platform]/[handle]">) {
  const { locale, platform, handle: rawHandle } = await params;
  setRequestLocale(locale);
  if (platform !== "tiktok" && platform !== "youtube" && platform !== "instagram") notFound();
  const handle = decodeURIComponent(rawHandle);
  const t = await getTranslations("tracking");
  const format = await getFormatter();
  const stats = await loadAccount(platform, handle);

  return (
    <div>
      <header className="page-wash px-4 md:px-10 pt-8 pb-8">
        <Link href="/app/tracking" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {t("back")}
        </Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="font-heading text-3xl font-bold">{stats.displayName ?? `@${handle}`}</h1>
            <a
              href={profileUrl(platform, handle)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              @{handle} · {platform === "tiktok" ? "TikTok" : platform === "instagram" ? "Instagram" : "YouTube"} <ExternalLink className="size-3.5" />
            </a>
            {stats.fetchedAt && (
              <p className="mt-1 text-xs text-muted-foreground">{t("updated", { when: format.relativeTime(new Date(stats.fetchedAt)) })}</p>
            )}
          </div>
          <div className="grid w-full max-w-xl gap-4 sm:grid-cols-[1fr_200px]">
            <KpiTiles stats={stats} />
            <div className="rounded-xl bg-white/70 p-3">
              <p className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{t("postsPerMonth")}</p>
              <MonthBars data={stats.postsPerMonth} />
            </div>
          </div>
        </div>
      </header>

      <section className="px-4 md:px-10 pb-16">
        <h2 className="mb-4 font-heading text-lg font-bold">{t("allPosts")}</h2>
        {stats.videos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("noVideos")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {stats.videos.map((v) => (
              <OutlierCard key={v.platformVideoId} video={v} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
