import { getTranslations, setRequestLocale } from "next-intl/server";
import { OutlierCard } from "@/components/outlier-card";
import { type VideoRow, videoFromRow } from "@/lib/db-mappers";
import { labelFor, reachScore } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";

export default async function SavedPage({ params }: PageProps<"/[locale]/app/saved">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("saved");
  const supabase = await createClient();
  const { data } = await supabase.from("saved_videos").select("created_at, videos(*)").order("created_at", { ascending: false });

  const videos = ((data ?? []) as unknown as { videos: VideoRow | null }[])
    .map((r) => r.videos)
    .filter((v): v is VideoRow => v !== null)
    .map((v) => {
      const reach = reachScore(v.views, v.creator_followers);
      return videoFromRow(v, { reach, usual: null, usualViews: null, label: labelFor(null, reach) });
    });

  return (
    <div>
      <header className="page-wash px-10 pt-10 pb-8">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="px-10 pb-16">
        {videos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {videos.map((v) => (
              <OutlierCard key={v.dbId} video={v} saved />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
