import { Bookmark, Folder, FolderOpen, Inbox } from "lucide-react";
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

  const navItem = (href: string, icon: React.ReactNode, label: string, n: number, on: boolean) => (
    <Link
      key={href}
      href={href}
      scroll={false}
      className={`flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-sm transition lg:w-full ${
        on ? "bg-primary text-primary-foreground shadow-sm" : "bg-card ring-1 ring-border hover:bg-muted lg:bg-transparent lg:ring-0"
      }`}
    >
      {icon}
      <span className="max-w-40 truncate lg:flex-1">{label}</span>
      <span className={`text-xs ${on ? "opacity-80" : "text-muted-foreground"}`}>{n}</span>
    </Link>
  );

  return (
    <div>
      <header className="page-wash px-4 md:px-10 pt-10 pb-8">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="grid gap-6 px-4 pb-16 md:px-10 lg:grid-cols-[230px_1fr]">
        {/* Folders: a sidebar on desktop, a scrolling row on phones. */}
        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <p className="hidden text-xs font-semibold tracking-widest text-muted-foreground uppercase lg:block">{t("folders")}</p>
          <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
            {navItem("/app/saved", <Bookmark className="size-4" />, t("all"), rows.length, !open)}
            {collections.map((f) =>
              navItem(`/app/saved?c=${f.id}`, openFolder?.id === f.id ? <FolderOpen className="size-4" /> : <Folder className="size-4" />, f.name, countOf(f.id), openFolder?.id === f.id),
            )}
            {collections.length > 0 && navItem("/app/saved?c=none", <Inbox className="size-4" />, t("noFolder"), countOf(null), open === "none")}
          </nav>
          <NewCollection />
          {collections.length === 0 && rows.length > 0 && <p className="text-xs text-muted-foreground">{t("foldersHint")}</p>}
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-1.5 font-heading text-xl font-bold">
              {openFolder ? <FolderOpen className="size-5 text-primary" /> : null}
              {openFolder ? openFolder.name : open === "none" ? t("noFolder") : t("all")}
              <span className="text-base font-normal text-muted-foreground">({shown.length})</span>
            </h2>
            {openFolder && <DeleteCollection {...openFolder} />}
          </div>
          {shown.length === 0 ? (
            <p className="rounded-2xl bg-muted/60 py-10 text-center text-sm text-muted-foreground">{openFolder ? t("emptyFolder") : t("empty")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
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
        </section>
      </div>
    </div>
  );
}
