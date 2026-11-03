import { CheckCircle2 } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Thumb } from "@/components/thumb";
import { Link } from "@/i18n/navigation";
import { type CanvasContent, versionText } from "@/lib/canvas";
import { madeWithReelySummary, matchCandidates, SUGGEST_SCORE, SUMMARY_MIN } from "@/lib/did-it-work";
import { formatMultiplier } from "@/lib/scoring";
import type { ScoredVideo } from "@/lib/search";
import type { createClient } from "@/lib/supabase/server";
import { SuggestLink } from "./suggest-link";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * "Made with Reely" on a channel page: the posts the founder linked to canvas versions, how each did against this
 * channel's usual, the comparison with the other posts (from 3 linked posts), and up to 2 suggested links for recent
 * versions whose caption matches a new post. Nothing is linked without the founder's yes.
 */
export async function MadeWithReely({ supabase, productId, videos, now }: { supabase: Supabase; productId: string; videos: ScoredVideo[]; now: number }) {
  const t = await getTranslations("me.made");
  const format = await getFormatter();
  const ids = videos.map((v) => v.dbId).filter((id): id is number => id !== undefined);
  if (!ids.length) return null;
  const since = new Date(now - 45 * 864e5).toISOString();
  const [{ data: linkedRows }, { data: recent }] = await Promise.all([
    supabase.from("canvas_outputs").select("id, canvas_id, posted_video_id, canvases(title)").in("posted_video_id", ids),
    supabase
      .from("canvas_outputs")
      .select("id, content, created_at, canvases!inner(title, product_id)")
      .eq("canvases.product_id", productId)
      .is("posted_video_id", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const byId = new Map(videos.filter((v) => v.dbId).map((v) => [v.dbId!, v]));
  type Row = { id: string; canvas_id: string; posted_video_id: number; canvases: { title: string } | null };
  const linked = ((linkedRows ?? []) as unknown as Row[]).filter((r) => byId.has(r.posted_video_id));
  const linkedIds = new Set(linked.map((r) => r.posted_video_id));
  const summary = madeWithReelySummary(
    linked.map((r) => byId.get(r.posted_video_id)!.usual),
    videos.filter((v) => v.dbId && !linkedIds.has(v.dbId)).map((v) => v.usual),
  );

  // Suggestions: a recent version whose words show up in a post that isn't linked yet.
  type Recent = { id: string; content: CanvasContent; created_at: string; canvases: { title: string } | null };
  const open = videos.filter((v) => v.dbId && !linkedIds.has(v.dbId)).map((v) => ({ id: v.dbId!, caption: v.caption, publishedAt: v.publishedAt }));
  const taken = new Set<number>();
  const suggestions = ((recent ?? []) as unknown as Recent[]).flatMap((o) => {
    const best = matchCandidates({ text: versionText(o.content), createdAt: o.created_at }, open).find((p) => !taken.has(p.id));
    if (!best || best.score < SUGGEST_SCORE) return [];
    taken.add(best.id);
    return [{ outputId: o.id, title: o.canvases?.title || "—", video: byId.get(best.id)! }];
  }).slice(0, 2);

  if (!linked.length && !suggestions.length) {
    return (
      <section className="space-y-1 rounded-3xl border bg-card p-4" data-me="made">
        <h2 className="font-heading text-lg font-bold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </section>
    );
  }
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const card = (v: ScoredVideo) => (
    <a href={v.url} target="_blank" rel="noreferrer" className="block w-10 shrink-0 overflow-hidden rounded-md ring-1 ring-border">
      <span className="block aspect-[9/16]">
        <Thumb src={v.thumbnailUrl} videoId={v.dbId} className="h-full w-full object-cover" />
      </span>
    </a>
  );

  return (
    <section className="space-y-3 rounded-3xl border bg-card p-4" data-me="made">
      <div>
        <h2 className="font-heading text-lg font-bold">{t("title")}</h2>
        <p className="text-sm">
          {summary
            ? t("summary", { x: formatMultiplier(summary.linked), others: summary.others !== null ? formatMultiplier(summary.others) : "—", n: summary.count })
            : t("summaryWait", { min: SUMMARY_MIN, n: linked.length })}
        </p>
      </div>
      {suggestions.map((s) => (
        <SuggestLink key={s.outputId} outputId={s.outputId} videoId={s.video.dbId!} title={s.title} caption={s.video.caption} />
      ))}
      {linked.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2">
          {linked.map((r) => {
            const v = byId.get(r.posted_video_id)!;
            const growing = v.publishedAt ? now - Date.parse(v.publishedAt) < 3 * 864e5 : false;
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl border p-2 text-sm">
                {card(v)}
                <span className="min-w-0 flex-1">
                  <Link href={`/app/canvas/${r.canvas_id}`} className="line-clamp-1 font-medium hover:underline">
                    <CheckCircle2 className="mr-1 inline size-3.5 text-emerald-600" />
                    {r.canvases?.title || "—"}
                  </Link>
                  <span className="block tabular-nums">
                    {v.views !== null ? compact(v.views) : "—"}
                    {v.usual !== null && <> · <b>{t("x", { x: formatMultiplier(v.usual) })}</b></>}
                    {growing && <span className="text-muted-foreground"> · {t("growing")}</span>}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
