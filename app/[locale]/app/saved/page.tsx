import { Folder } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OutlierCard } from "@/components/outlier-card";
import { Link } from "@/i18n/navigation";
import { type VideoRow, videoFromRow } from "@/lib/db-mappers";
import { labelFor, reachScore, usualScore } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import { type Collection, DeleteCollection, FolderPicker, NewCollection } from "./collection-controls";

/** Saved clips, in folders: `?c=<id>` opens one folder, `?c=none` the clips in no folder. */
export default async function SavedPage({ params, searchParams }: PageProps<"/[locale]/app/saved">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { c } = await searchParams;
  const t = await getTranslations("saved");
  const supabase = await createClient();
  const [{ data }, { data: folders }] = await Promise.all([
    supabase.from("saved_videos").select("created_at, collection_id, videos(*)").order("created_at", { ascending: false }),
    supabase.from("collections").select("id, name").order("created_at"),
  ]);
  const collections = (folders ?? []) as Collection[];
  const rows = ((data ?? []) as unknown as { collection_id: string | null; videos: VideoRow | null }[]).filter(
    (r): r is { collection_id: string | null; videos: VideoRow } => r.videos !== null,
  );

  // The creators' usual views, so saved clips keep their multiplier.
  const handles = [...new Set(rows.map((r) => r.videos.creator_handle))];
  const { data: creators } = handles.length
    ? await supabase.from("creators").select("platform, handle, usual_views").in("handle", handles)
    : { data: [] };
  const usualOf = new Map((creators ?? []).map((cr) => [`${cr.platform}:${cr.handle}`, cr.usual_views as number | null]));

  const open = typeof c === "string" ? c : null;
  const openFolder = collections.find((f) => f.id === open) ?? null;
  const shown = rows.filter((r) => (open === "none" ? !r.collection_id : openFolder ? r.collection_id === openFolder.id : true));
  const countOf = (id: string | null) => rows.filter((r) => r.collection_id === id).length;

  const chip = (href: string, label: string, n: number, on: boolean) => (
    <Link key={href} href={href} scroll={false} className={`chip ${on ? "chip-on" : ""}`}>
      {label} <span className="text-muted-foreground">{n}</span>
    </Link>
  );

  return (
    <div>
      <header className="page-wash px-4 md:px-10 pt-10 pb-8">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="space-y-6 px-4 md:px-10 pb-16">
        <div className="flex flex-wrap items-center gap-2">
          {chip("/app/saved", t("all"), rows.length, !open)}
          {collections.map((f) => chip(`/app/saved?c=${f.id}`, f.name, countOf(f.id), openFolder?.id === f.id))}
          {collections.length > 0 && chip("/app/saved?c=none", t("noFolder"), countOf(null), open === "none")}
          <NewCollection />
        </div>
        {openFolder && (
          <div className="flex items-center gap-2">
            <h2 className="inline-flex items-center gap-1.5 font-heading text-xl font-bold">
              <Folder className="size-5 text-primary" /> {openFolder.name}
            </h2>
            <DeleteCollection {...openFolder} />
          </div>
        )}
        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{openFolder ? t("emptyFolder") : t("empty")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map(({ videos: v, collection_id }) => {
              const usualViews = usualOf.get(`${v.platform}:${v.creator_handle}`) ?? null;
              const usual = usualScore(v.views, usualViews);
              const reach = reachScore(v.views, v.creator_followers);
              const video = videoFromRow(v, { reach, usual, usualViews, label: labelFor(usual, reach, { views: v.views, followers: v.creator_followers }) });
              return (
                <div key={v.id} className="space-y-2">
                  <OutlierCard video={video} saved />
                  {collections.length > 0 && <FolderPicker videoId={v.id} value={collection_id} collections={collections} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
